import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  }),
});

export interface NotifyOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: boolean;
}

export interface ScheduleOptions extends NotifyOptions {
  /** Exact Date to fire, OR seconds from now */
  at: Date | number;
}

class NotificationService {
  private initialized = false;
  private expoPushToken: string | null = null;

  // Add a parameter here, defaulting to false
  async initialize(enablePush: boolean = false): Promise<void> {
    if (this.initialized) return;

    if (!Device.isDevice && enablePush) {
      console.warn('[Notifications] Push notifications require a physical device.');
    }

    await this.requestPermissions();
    await this.setupAndroidChannel();

    // ONLY attempt to get a token if we explicitly ask for it
    if (enablePush) {
      this.expoPushToken = await this.registerForPushNotifications();
    }

    this.initialized = true;
  }

  private async requestPermissions(): Promise<void> {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[Notifications] Permission not granted.');
      }
    }
  }

  private async setupAndroidChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  private async registerForPushNotifications(): Promise<string | null> {
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      if (!projectId) {
        console.warn('[Notifications] No EAS project ID found — push tokens may fail.');
      }

      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      return token.data;
    } catch (e) {
      console.warn('[Notifications] Failed to get push token:', e);
      return null;
    }
  }

  /** Fire immediately */
  async notify(options: NotifyOptions): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data ?? {},
        sound: options.sound !== false,
        badge: options.badge,
      },
      trigger: null,
    });
  }

  /**
   * Schedule for a specific time (one-shot).
   * `at` = a Date object, or seconds from now.
   */
  async scheduleNotify(options: ScheduleOptions): Promise<string> {
    const fireDate =
      options.at instanceof Date
        ? options.at
        : new Date(Date.now() + options.at * 1000);

    return Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data ?? {},
        sound: options.sound !== false,
        badge: options.badge,
      },
      trigger: { 
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate 
      },
    });
  }

/**
*Repeat every N seconds, starting immediately. Use this for things like 'remind me every hour'. 
*Note: this API does not currently support calendar-based repeating (e.g. every Tuesday at 9 AM).
**/
  async scheduleRepeating(
    options: NotifyOptions,
    repeatEverySeconds: number
  ): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data ?? {},
        sound: options.sound !== false,
        badge: options.badge,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: repeatEverySeconds,
        repeats: true,
      },
    });
  }

  async cancel(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async getScheduled(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  }

  getExpoPushToken(): string | null {
    return this.expoPushToken;
  }

  onNotificationTapped(
    handler: (notification: Notifications.Notification) => void
  ): () => void {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => handler(response.notification)
    );
    return () => sub.remove();
  }
}

export const notificationService = new NotificationService();