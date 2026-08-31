// Description: Razorpay Standard Checkout integration — following official Razorpay docs.
// Ref: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/

(function () {
  'use strict';

  /* ── Utilities ─────────────────────────────────────────────────────────── */
  function getCsrf() {
    const cookies = document.cookie.split(';');
    for (const c of cookies) {
      const [k, v] = c.trim().split('=');
      if (k === 'csrftoken') return decodeURIComponent(v);
    }
    return '';
  }

  function getCart() {
    return JSON.parse(localStorage.getItem('cartItems') || '[]');
  }

  function showToast(msg, type = 'info') {
    const toast = document.getElementById('checkoutToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
  }

  function setPayBtnLoading(loading) {
    const btn = document.getElementById('rzp-button1');
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.classList.add('loading');
    } else {
      btn.classList.remove('loading');
    }
  }

  /* ── Cart Rendering ────────────────────────────────────────────────────── */
  function renderCheckoutSummary() {
    const cart = getCart();
    const tbody = document.getElementById('checkoutItemsBody');
    const subtotalEl = document.getElementById('checkoutSubtotal');
    const totalEl = document.getElementById('checkoutTotal');

    if (!tbody) return;

    if (!cart.length) {
      document.querySelector('.checkout-page').innerHTML = `
        <div class="checkout-empty">
          <div class="icon">🛒</div>
          <h3>Your cart is empty</h3>
          <p>Add items from the menu before checking out.</p>
          <a href="/" class="back-btn" style="margin-top:1.25rem;">← Back to Home</a>
        </div>`;
      return;
    }

    let subtotal = 0;
    tbody.innerHTML = cart.map(item => {
      const tot = parseFloat(item.price) * item.qty;
      subtotal += tot;
      return `
        <tr>
          <td>
            <div class="item-info">
              <img src="${item.img || ''}" alt="${item.name}"
                   onerror="this.style.display='none'">
              <span class="item-name">${item.name}</span>
            </div>
          </td>
          <td class="col-qty">${item.qty}</td>
          <td class="col-price">₹${parseFloat(item.price).toFixed(2)}</td>
          <td class="col-subtotal">₹${tot.toFixed(2)}</td>
        </tr>`;
    }).join('');

    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    if (totalEl)    totalEl.textContent    = `₹${subtotal.toFixed(2)}`;
    updatePayButtonLabel(subtotal);
  }

  function updatePayButtonLabel(subtotal) {
    const payLabelEl = document.getElementById('payAmountLabel');
    if (!payLabelEl) return;
    if (subtotal === undefined) {
      const cart = getCart();
      subtotal = cart.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0);
    }
    payLabelEl.textContent = `₹${subtotal.toFixed(2)}`;
  }

  /* ── Checkout Chips ────────────────────────────────────────────────────── */
  let selectedTime = '';
  let selectedType = 'Dine In';
  let selectedDate = '';

  function getISODate(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getDisplayDateLabel(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const options = { month: 'short', day: 'numeric' };
    const formatted = d.toLocaleDateString('en-US', options);
    if (daysOffset === 0) return `Today (${formatted})`;
    if (daysOffset === 1) return `Tomorrow (${formatted})`;
    if (daysOffset === 2) return `Day After Tomorrow (${formatted})`;
    return formatted;
  }

  function initChips() {
    // Populate date chips
    const dateContainer = document.getElementById('dateChips');
    if (dateContainer) {
      const savedDate = sessionStorage.getItem('checkoutDate') || getISODate(0);
      selectedDate = savedDate;
      const dates = [
        { iso: getISODate(0), label: getDisplayDateLabel(0) },
        { iso: getISODate(1), label: getDisplayDateLabel(1) },
        { iso: getISODate(2), label: getDisplayDateLabel(2) },
      ];
      dateContainer.innerHTML = dates.map(d => `
        <button type="button" class="checkout-chip ${d.iso === selectedDate ? 'active' : ''}" data-value="${d.iso}">
          ${d.label}
        </button>
      `).join('');

      dateContainer.querySelectorAll('.checkout-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          dateContainer.querySelectorAll('.checkout-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          selectedDate = chip.dataset.value;
        });
      });
    }

    document.querySelectorAll('#timeChips .checkout-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#timeChips .checkout-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedTime = chip.dataset.value;
      });
    });

    document.querySelectorAll('#typeChips .checkout-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#typeChips .checkout-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedType = chip.dataset.value;
      });
    });

    // Set defaults from session storage (populated by cart page)
    const savedTime = sessionStorage.getItem('checkoutPickupTime');
    const savedType = sessionStorage.getItem('checkoutOrderType');
    if (savedTime) {
      const chip = document.querySelector(`#timeChips .checkout-chip[data-value="${savedTime}"]`);
      if (chip) {
        document.querySelectorAll('#timeChips .checkout-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedTime = savedTime;
      }
    }
    if (savedType) {
      const chip = document.querySelector(`#typeChips .checkout-chip[data-value="${savedType}"]`);
      if (chip) {
        document.querySelectorAll('#typeChips .checkout-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedType = savedType;
      }
    }

    // First active chip as fallback
    const activeTime = document.querySelector('#timeChips .checkout-chip.active');
    if (activeTime && !selectedTime) selectedTime = activeTime.dataset.value;
  }

  /* ── Step 1: Create Order on Server (Razorpay Docs §1.1) ────────────── */
  function initiatePayment() {
    const cart = getCart();
    if (!cart.length) {
      showToast('Your cart is empty.', 'error');
      return;
    }

    const date = selectedDate || getISODate(0);

    setPayBtnLoading(true);

    const payload = {
      items: cart.map(i => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        price: i.price,
      })),
      pickup_time: selectedTime,
      order_type: selectedType,
      date: date,
      total: cart.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0),
    };

    console.log('[Checkout] Step 1: Creating order on server with payload:', payload);

    // Server-side API call to create Razorpay order
    fetch('/payments/create-order/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrf(),
      },
      body: JSON.stringify(payload),
    })
      .then(r => {
        console.log('[Checkout] Create-order response status:', r.status);
        return r.json();
      })
      .then(data => {
        console.log('[Checkout] Create-order response data:', data);
        if (data.status !== 'success') {
          showToast(data.message || 'Failed to create order. Please try again.', 'error');
          setPayBtnLoading(false);
          return;
        }
        // Step 2: Open Razorpay Checkout with the order_id from Step 1
        openRazorpayCheckout(data);
      })
      .catch(err => {
        console.error('[Checkout] Create-order fetch error:', err);
        showToast('Network error. Please check your connection and try again.', 'error');
        setPayBtnLoading(false);
      });
  }

  /* ── Step 2: Integrate with Checkout on Client-Side (Razorpay Docs §1.2) */
  function openRazorpayCheckout(orderData) {
    console.log('[Checkout] Step 2: Opening Razorpay Checkout with:', {
      key: orderData.key_id,
      amount: orderData.amount,
      order_id: orderData.order_id,
      order_ref: orderData.order_ref,
    });

    // Build prefill (Razorpay Docs §1.2.3 - prefill object)
    const prefill = {};
    if (window.CHECKOUT_USER_NAME && window.CHECKOUT_USER_NAME.trim() !== '') {
      prefill.name = window.CHECKOUT_USER_NAME.trim();
    }
    if (window.CHECKOUT_USER_EMAIL && window.CHECKOUT_USER_EMAIL.trim() !== '' && window.CHECKOUT_USER_EMAIL.includes('@')) {
      prefill.email = window.CHECKOUT_USER_EMAIL.trim();
    }

    // Razorpay Checkout Options — following official docs exactly (§1.2.2 Handler Function code)
    var options = {
      "key": window.RAZORPAY_KEY_ID || orderData.key_id,  // Key ID generated from the Dashboard
      "amount": String(orderData.amount),             // Amount in currency subunits (paise)
      "currency": orderData.currency || "INR",
      "name": "LICET Cafeteria",                      // Business name
      "description": "Order " + orderData.order_ref,
      "order_id": orderData.order_id,                 // order_id from Step 1
      "handler": function (response) {
        // §1.3 Handle Payment Success — handler receives razorpay_payment_id, razorpay_order_id, razorpay_signature
        console.log('[Checkout] Step 3: Payment SUCCESS handler called:', {
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature ? response.razorpay_signature.substring(0, 20) + '...' : 'none',
        });
        // §1.4 Store fields & §1.5 Verify signature on server
        verifyPayment(response, orderData.order_ref, orderData.payment_uuid);
      },
      "prefill": prefill,
      "notes": {
        "order_ref": orderData.order_ref
      },
      "theme": {
        "color": "#f97316"
      },
      "modal": {
        "confirm_close": true,        // Show confirmation dialog if user tries to close
        "backdropclose": false,       // Don't close on backdrop click
        "escape": true,               // Allow Esc key (default per docs)
        "ondismiss": function () {
          // Track modal dismissal
          console.log('[Checkout] Razorpay modal dismissed by user');
          showToast('Payment window closed. Click Pay Now to retry.', 'info');
          setPayBtnLoading(false);
        }
      },
      "retry": {
        "enabled": true               // Allow retry on the checkout itself
      }
    };

    // Create Razorpay instance
    var rzp1 = new Razorpay(options);

    // §1.3 Handle Payment Failure — payment.failed event
    rzp1.on('payment.failed', function (response) {
      console.error('[Checkout] payment.failed event:', {
        code: response.error.code,
        description: response.error.description,
        source: response.error.source,
        step: response.error.step,
        reason: response.error.reason,
        order_id: response.error.metadata.order_id,
        payment_id: response.error.metadata.payment_id,
      });

      setPayBtnLoading(false);
      showToast(response.error.description || 'Payment failed. Please retry.', 'error');

      // Record failure on server (fire-and-forget, don't redirect)
      fetch('/payments/record-failure/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrf(),
        },
        body: JSON.stringify({
          razorpay_order_id: orderData.order_id,
          error_description: response.error.description || 'Payment failed',
          error_code: response.error.code,
          error_reason: response.error.reason,
        }),
      }).catch(function (e) {
        console.warn('[Checkout] Could not record failure:', e);
      });
    });

    // Open the Razorpay Checkout modal
    rzp1.open();
  }

  /* ── Step 3-5: Verify Payment on Server (Razorpay Docs §1.4, §1.5) ──── */
  function verifyPayment(response, orderRef, paymentUuid) {
    console.log('[Checkout] Step 4-5: Sending to server for signature verification:', {
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_order_id: response.razorpay_order_id,
      order_ref: orderRef,
    });

    fetch('/payments/verify/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrf(),
      },
      body: JSON.stringify({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
        order_ref: orderRef,
        payment_uuid: paymentUuid,
      }),
    })
      .then(function (r) {
        console.log('[Checkout] Verify response status:', r.status);
        return r.json();
      })
      .then(function (data) {
        console.log('[Checkout] Verify response data:', data);
        if (data.status === 'success') {
          // §1.6 Payment captured — clear cart and redirect
          localStorage.setItem('cartItems', '[]');
          sessionStorage.removeItem('checkoutPickupTime');
          sessionStorage.removeItem('checkoutOrderType');
          // Update nav badge
          var badge = document.getElementById('nav-cart-badge');
          if (badge) badge.textContent = '0';
          window.location.href = data.redirect_url || '/payments/success/' + orderRef + '/';
        } else {
          console.error('[Checkout] Server-side verification failed:', data);
          showToast(data.message || 'Verification failed. Contact support.', 'error');
          setPayBtnLoading(false);
          setTimeout(function () {
            window.location.href = '/payments/failed/' + orderRef + '/';
          }, 2500);
        }
      })
      .catch(function (err) {
        console.error('[Checkout] Verify fetch error:', err);
        showToast('Verification network error. Please contact support.', 'error');
        setPayBtnLoading(false);
      });
  }

  /* ── Retry Payment (on failed page) ───────────────────────────────────── */
  window.retryPayment = function (orderRef) {
    var btn = document.getElementById('retryBtn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
    }

    fetch('/payments/retry/' + orderRef + '/', {
      method: 'POST',
      headers: { 'X-CSRFToken': getCsrf() },
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status !== 'success') {
          alert(data.message || 'Could not retry payment.');
          if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
          return;
        }

        // Build prefill
        var prefill = {};
        if (window.CHECKOUT_USER_NAME && window.CHECKOUT_USER_NAME.trim() !== '') {
          prefill.name = window.CHECKOUT_USER_NAME.trim();
        }
        if (window.CHECKOUT_USER_EMAIL && window.CHECKOUT_USER_EMAIL.trim() !== '' && window.CHECKOUT_USER_EMAIL.includes('@')) {
          prefill.email = window.CHECKOUT_USER_EMAIL.trim();
        }

        // Razorpay options per official docs
        var options = {
          "key": data.key_id,
          "amount": String(data.amount),
          "currency": data.currency || "INR",
          "name": "LICET Cafeteria",
          "description": "Retry - Order " + data.order_ref,
          "order_id": data.order_id,
          "handler": function (response) {
            verifyPayment(response, data.order_ref, null);
          },
          "prefill": prefill,
          "theme": { "color": "#f97316" },
          "modal": {
            "confirm_close": true,
            "backdropclose": false,
            "ondismiss": function () {
              if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
            }
          },
          "retry": {
            "enabled": true
          }
        };

        var rzp1 = new Razorpay(options);
        rzp1.on('payment.failed', function (response) {
          console.error('[Checkout] Retry payment.failed:', response.error);
          if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
          showToast(response.error.description || 'Payment failed.', 'error');

          fetch('/payments/record-failure/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': getCsrf(),
            },
            body: JSON.stringify({
              razorpay_order_id: data.order_id,
              error_description: response.error.description || 'Payment failed',
            }),
          }).catch(function (e) { console.warn('Could not record failure:', e); });
        });

        rzp1.open();
      })
      .catch(function () {
        alert('Network error. Please try again.');
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
      });
  };

  /* ── Init (per official Razorpay docs: attach onclick to rzp-button1) ── */
  document.addEventListener('DOMContentLoaded', function () {
    renderCheckoutSummary();
    initChips();

    // Attach pay button — matches official Razorpay pattern:
    // document.getElementById('rzp-button1').onclick = function(e){ rzp1.open(); e.preventDefault(); }
    document.getElementById('rzp-button1').onclick = function (e) {
      e.preventDefault();
      initiatePayment();
    };
  });
})();
