import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";

/**
 * Налаштування поведінки сповіщень, коли додаток активний (Foreground).
 * Показуємо банер, граємо звук та додаємо бейдж.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Хук для реєстрації Push-сповіщень та обробки переходів у чат (Deep Linking)
 */
export function usePushNotifications() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  // @ts-ignore - savePushToken буде типізовано після генерації api.d.ts
  const savePushToken = useMutation(api.users.savePushToken);
  const router = useRouter();

  // Обробка сповіщення при холодному старті додатку (якщо додаток був повністю закритий)
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  /**
   * Маршрутизація (Deep Linking) за даними зі сповіщення
   */
  const handleNotificationNavigation = (data: any) => {
    if (!data) return;

    console.log("🧭 Навігація за пуш-сповіщенням:", data);

    const targetRoomId = data.roomId || data.chatRoomId;

    if (targetRoomId) {
      router.push(`/(app)/chat/${targetRoomId}` as any);
    } else {
      router.push("/(app)" as any);
    }
  };

  // Ефект 1: Обробка переходу при "холодному старті"
  useEffect(() => {
    if (
      lastNotificationResponse &&
      lastNotificationResponse.actionIdentifier ===
        Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      const data = lastNotificationResponse.notification.request.content.data;
      handleNotificationNavigation(data);
    }
  }, [lastNotificationResponse]);

  // Ефект 2: Отримання токена та підписка на події сповіщень
  useEffect(() => {
    // Реєструємо токен тільки для авторизованого користувача
    if (isLoading || !isAuthenticated) return;

    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) {
          console.log("📲 Збереження Expo Push Token у Convex:", token);
          savePushToken({ pushToken: token }).catch((err) => {
            console.error("❌ Помилка збереження pushToken у Convex:", err);
          });
        }
      })
      .catch((err) => {
        console.warn("⚠️ Помилка при реєстрації пуш-сповіщень:", err);
      });

    try {
      // Слухач сповіщень, коли додаток відкрито на передньому плані (Foreground)
      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          console.log(
            "🔔 Отримано сповіщення у Foreground:",
            notification.request.content
          );
        });

      // Слухач натискання користувача на сповіщення (Background / Notification Bar)
      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          handleNotificationNavigation(data);
        });
    } catch (listenerError) {
      console.warn("⚠️ Не вдалося зареєструвати слухачі сповіщень:", listenerError);
    }

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated, isLoading]);
}

/**
 * Налаштування Android Notification Channel та безпечне отримання Push-токена
 */
async function registerForPushNotificationsAsync(): Promise<string | null> {
  // На вебі push-сповіщення через Expo Notifications не підтримуються безпосередньо
  if (Platform.OS === "web") {
    return null;
  }

  // 1. Налаштування каналу сповіщень для Android
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Повідомлення чату",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#2563EB",
        sound: "default",
      });
    } catch (channelError) {
      console.warn("⚠️ Не вдалося налаштувати системний Notification Channel:", channelError);
    }
  }

  // 2. Перевірка та запит системних дозволів
  let finalStatus: Notifications.PermissionStatus;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
  } catch (permError) {
    console.warn("⚠️ Помилка при запиті дозволів на сповіщення:", permError);
    return null;
  }

  if (finalStatus !== "granted") {
    console.log("ℹ️ Користувач не надав дозвіл на системні сповіщення");
    return null;
  }

  // 3. Безпечне отримання Expo Push Token з обробкою відсутності projectId
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId || projectId === "ВАШ_EAS_PROJECT_ID") {
      console.warn(
        "⚠️ EAS Project ID не налаштовано в app.config.ts (extra.eas.projectId). Пропускаємо запит push-токена."
      );
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return tokenData.data;
  } catch (error) {
    console.warn(
      "⚠️ Не вдалося отримати Expo Push Token (можливо, не налаштовано google-services.json або пристрій без Google Play Services):",
      error
    );
    return null;
  }
}
