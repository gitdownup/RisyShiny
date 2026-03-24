// TODO: Add push notifications support later
import { useEffect, useState } from 'react';
import { notificationService } from './NotificationService';
import type { Notification } from 'expo-notifications';

interface UseNotificationsOptions {
  onTap?: (notification: Notification) => void;
  enablePush?: boolean;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    notificationService.initialize(options.enablePush ?? false).then(() => {
      setPushToken(notificationService.getExpoPushToken());
    })

    const unsub = options.onTap
      ? notificationService.onNotificationTapped(options.onTap)
      : undefined;

    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { service: notificationService, pushToken };
}