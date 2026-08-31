# Description: Core business logic for Razorpay payment processing.
import razorpay
import logging
from decimal import Decimal
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def get_razorpay_client():
    """Returns a configured Razorpay client instance."""
    return razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )


def create_razorpay_order(amount_rupees, receipt, notes=None):
    """
    Creates a Razorpay order for the given amount.

    Args:
        amount_rupees: Amount in rupees (Decimal or float)
        receipt: Internal receipt/reference string
        notes: Optional dict of metadata (max 15 key-value pairs)

    Returns:
        dict: Razorpay order response containing 'id', 'amount', 'currency', etc.

    Raises:
        razorpay.errors.BadRequestError: If invalid parameters
    """
    client = get_razorpay_client()
    amount_paise = int(Decimal(str(amount_rupees)) * 100)

    order_data = {
        'amount': amount_paise,
        'currency': 'INR',
        'receipt': receipt,
        'payment_capture': 1,  # Auto-capture on authorization
    }
    if notes:
        order_data['notes'] = notes

    order = client.order.create(data=order_data)
    logger.info(f"Razorpay order created: {order['id']} for ₹{amount_rupees}")
    return order


def verify_payment_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature):
    """
    Verifies the payment signature using Razorpay SDK.

    The signature is HMAC SHA256 of (order_id + "|" + payment_id) using key_secret.

    Args:
        razorpay_order_id: The Razorpay order ID
        razorpay_payment_id: The Razorpay payment ID
        razorpay_signature: The signature from Checkout

    Returns:
        bool: True if signature is valid, False otherwise
    """
    client = get_razorpay_client()
    params_dict = {
        'razorpay_order_id': razorpay_order_id,
        'razorpay_payment_id': razorpay_payment_id,
        'razorpay_signature': razorpay_signature,
    }
    try:
        client.utility.verify_payment_signature(params_dict)
        logger.info(f"Signature verified for payment {razorpay_payment_id}")
        return True
    except razorpay.errors.SignatureVerificationError:
        logger.warning(f"Signature verification FAILED for payment {razorpay_payment_id}")
        return False


def verify_webhook_signature(request_body, signature):
    """
    Verifies a webhook signature using the webhook secret.

    Args:
        request_body: Raw request body as string
        signature: X-Razorpay-Signature header value

    Returns:
        bool: True if signature is valid
    """
    client = get_razorpay_client()
    try:
        client.utility.verify_webhook_signature(
            request_body,
            signature,
            settings.RAZORPAY_WEBHOOK_SECRET
        )
        return True
    except razorpay.errors.SignatureVerificationError:
        logger.warning("Webhook signature verification FAILED")
        return False


def fetch_payment_details(payment_id):
    """
    Fetches full payment details from Razorpay API.

    Args:
        payment_id: Razorpay payment ID (pay_xxxxx)

    Returns:
        dict: Payment entity from Razorpay
    """
    client = get_razorpay_client()
    return client.payment.fetch(payment_id)


def process_successful_payment(payment_obj, razorpay_data):
    """
    Processes a verified successful payment:
    - Updates Payment record status
    - Updates all Order rows in the group
    - Generates invoice number and QR token

    Args:
        payment_obj: payments.models.Payment instance
        razorpay_data: dict with razorpay_payment_id, razorpay_signature

    Returns:
        Payment: Updated payment object
    """
    from .models import Payment
    from .utils import generate_invoice_number, generate_qr_code
    from base.models import Order

    payment_obj.razorpay_payment_id = razorpay_data.get('razorpay_payment_id', '')
    payment_obj.razorpay_signature = razorpay_data.get('razorpay_signature', '')
    payment_obj.status = 'captured'
    payment_obj.is_verified = True
    payment_obj.transaction_time = timezone.now()

    # Try to get the payment method from Razorpay
    try:
        details = fetch_payment_details(payment_obj.razorpay_payment_id)
        method = details.get('method', 'other')
        if method in dict(Payment.PAYMENT_METHOD_CHOICES):
            payment_obj.payment_method = method
        else:
            payment_obj.payment_method = 'other'
    except Exception as e:
        logger.warning(f"Could not fetch payment details: {e}")

    payment_obj.save()

    # Generate invoice number for this payment
    invoice_number = generate_invoice_number()

    # Get exact order IDs for this payment
    order_ids = _get_order_ids_from_group(payment_obj.order_group, payment_obj)
    orders = Order.objects.filter(
        customer=payment_obj.user,
        order_id__in=order_ids
    )

    for order in orders:
        order.status = True  # Mark as confirmed
        order.payment_status = 'paid'
        order.invoice_number = invoice_number
        order.save()

    # Generate QR code image
    qr_path = generate_qr_code(
        order_ref=payment_obj.order_group,
        student_id=payment_obj.user.username,
        amount=str(payment_obj.amount),
        invoice_number=invoice_number,
    )

    # Store invoice, QR, and exact order IDs on the payment record
    order_ids_str = ','.join(map(str, order_ids))
    payment_obj.remarks = f"Invoice: {invoice_number} | QR: {qr_path} | Orders: {order_ids_str}"
    payment_obj.save()

    logger.info(f"Payment {payment_obj.razorpay_payment_id} processed successfully for orders [{order_ids_str}]. Invoice: {invoice_number}")
    return payment_obj


def _get_order_ids_from_group(order_group, payment_obj=None):
    """
    Parses order IDs from an order group reference like 'LCT-0001' or Payment object.
    Returns ONLY the order IDs associated with this exact checkout payment.
    """
    from base.models import Order
    from .models import Payment

    if payment_obj is None:
        try:
            payment_obj = Payment.objects.get(order_group=order_group)
        except (Payment.DoesNotExist, Payment.MultipleObjectsReturned):
            payment_obj = None

    # 1. Check if remarks contains explicit "Orders: 71,72"
    if payment_obj and payment_obj.remarks and 'Orders:' in payment_obj.remarks:
        try:
            orders_part = payment_obj.remarks.split('Orders:')[1].strip()
            if '|' in orders_part:
                orders_part = orders_part.split('|')[0].strip()
            ids = [int(x.strip()) for x in orders_part.split(',') if x.strip().isdigit()]
            if ids:
                return ids
        except Exception:
            pass

    # 2. Check if Order rows have invoice_number matching order_group (e.g. 'LCT-0071')
    matching_by_group = list(Order.objects.filter(invoice_number=order_group).values_list('order_id', flat=True))
    if matching_by_group:
        return matching_by_group

    # 3. Fallback: Parse the starting order_id from 'LCT-0071' -> 71 and sum up to amount
    try:
        start_id = int(order_group.replace('LCT-', ''))
        if payment_obj:
            candidate_orders = Order.objects.filter(
                customer=payment_obj.user,
                order_id__gte=start_id
            ).order_by('order_id')

            matched_ids = []
            running_total = Decimal('0')
            for o in candidate_orders:
                sub = o.product.price * o.quantity
                matched_ids.append(o.order_id)
                running_total += sub
                if running_total >= payment_obj.amount:
                    break
            if matched_ids and running_total == payment_obj.amount:
                return matched_ids

        return [start_id]
    except Exception:
        return []


def calculate_pickup_slot():
    """
    Calculates the next available pickup slot based on current time.
    Rounds up to the next 15-minute window.

    Returns:
        tuple: (slot_string, estimated_time) e.g. ("1:15 PM - 1:30 PM", datetime)
    """
    now = timezone.localtime(timezone.now())

    # Round up to next 15-minute mark + add 15 minutes for preparation
    minutes = now.minute
    remainder = minutes % 15
    if remainder == 0:
        add_minutes = 15
    else:
        add_minutes = (15 - remainder) + 15

    from datetime import timedelta
    slot_start = now + timedelta(minutes=add_minutes)
    slot_end = slot_start + timedelta(minutes=15)

    # Zero out seconds
    slot_start = slot_start.replace(second=0, microsecond=0)
    slot_end = slot_end.replace(second=0, microsecond=0)

    # Windows strftime doesn't support %-I, use %#I instead
    try:
        slot_string = f"{slot_start.strftime('%-I:%M %p')} - {slot_end.strftime('%-I:%M %p')}"
    except ValueError:
        slot_string = f"{slot_start.strftime('%#I:%M %p')} - {slot_end.strftime('%#I:%M %p')}"

    return slot_string, slot_start
