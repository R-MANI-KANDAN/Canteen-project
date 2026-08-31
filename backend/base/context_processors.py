# Description: Custom context processor to inject user profile into all templates.
from .models import Profile


def user_profile(request):
    """Make the Profile object available as {{ profile }} in every template."""
    if request.user.is_authenticated:
        profile, _ = Profile.objects.get_or_create(user=request.user)
        return {'profile': profile}
    return {}
