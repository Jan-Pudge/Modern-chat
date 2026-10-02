import { useEffect, useRef } from "react";
import { Platform, Alert } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import type * as NotificationsType from "expo-notifications";
import { api } from "../convex/_generated/api";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Lazily load expo-notifications module.
 */
function getNotificationsModule(): typeof NotificationsType | null {
  if (isExpoGo || Platform.OS === "web") {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-notifications");
  } catch {
    return null;
  }
}

/**
 * Push notifications and deep linking registration hook.
 */
export function usePushNotifications() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  // @ts-ignore
  const savePushToken = useMutation(api.users.savePushToken);
  const router = useRouter();

  const notificationListener = useRef<NotificationsType.EventSubscription | null>(null);
  const responseListener = useRef<NotificationsType.EventSubscription | null>(null);

  const handleNotificationNavigation = (data: any) => {
    if (!data) return;

    const targetRoomId = data.roomId || data.chatRoomId;

    if (targetRoomId) {
      router.push(`/(app)/chat/${targetRoomId}` as any);
    } else {
      router.push("/(app)" as any);
    }
  };

  useEffect(() => {
    const Notifications = getNotificationsModule();
    if (!Notifications) {
      return;
    }

    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (
          response &&
          response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
          const data = response.notification.request.content.data;
          handleNotificationNavigation(data);
        }
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const Notifications = getNotificationsModule();
    if (!Notifications) return;

    registerForPushNotificationsAsync(Notifications)
      .then((token) => {
        if (token) {
          savePushToken({ pushToken: token }).catch((err) => {
            console.error("savePushToken error:", err);
          });
        }
      })
      .catch((err) => {
        console.warn("Push registration error:", err);
      });

    try {
      notificationListener.current =
        Notifications.addNotificationReceivedListener(() => {});

      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          handleNotificationNavigation(data);
        });
    } catch {}

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated, isLoading]);
}

async function registerForPushNotificationsAsync(
  Notifications: typeof NotificationsType
): Promise<string | null> {
  if (isExpoGo || Platform.OS === "web") {
    return null;
  }

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#2563EB",
        sound: "default",
      });
    } catch {}
  }

  let finalStatus: NotificationsType.PermissionStatus;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
  } catch {
    return null;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      "f2df32dc-e845-44fa-8cbf-849ff6dc294a";

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return tokenData.data;
  } catch (error: any) {
    console.warn("⚠️ Не вдалося отримати Expo Push Token:", error);
    return null;
  }
}
