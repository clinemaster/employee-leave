from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'message', 'is_read', 'related_application', 'created_at']
        read_only_fields = ['id', 'message', 'related_application', 'created_at']
