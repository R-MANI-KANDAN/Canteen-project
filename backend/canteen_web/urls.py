# Description: Main URL routing configuration for the canteen web application.
from django.contrib import admin
from django.urls import path, include, re_path
from . import settings
from django.conf.urls.static import static
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('allauth.urls')),  # Google OAuth routes
    path('', include('base.urls')),
    path('cart/', include('cart.urls')),
    path('payments/', include('payments.urls')),
]

# Static & media files routing
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
else:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]
