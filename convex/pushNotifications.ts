import { internalAction } from "./_generated/server";
import { v } from "convex/values";

/**
 * Внутрішній екшен для відправки push-сповіщення через Expo Push Service API
 */
export const sendPushNotification = internalAction({
  args: {
    pushToken: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    // 1. Валідація токена Expo
    if (!args.pushToken || !args.pushToken.startsWith("ExponentPushToken[")) {
      console.log("⚠️ Некоректний Expo pushToken, пропускаємо відправку:", args.pushToken);
      return { success: false, reason: "Invalid token" };
    }

    // 2. Формування тіла повідомлення з високим пріоритетом
    const message = {
      to: args.pushToken,
      sound: "default",
      title: args.title,
      body: args.body,
      data: args.data ?? {},
      priority: "high",
      channelId: "default",
    };

    // 3. Відправка HTTP POST запиту до сервісу Expo
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();
      console.log("📨 Push send result:", JSON.stringify(result));
      return result;
    } catch (error) {
      console.error("❌ Помилка відправки push-сповіщення:", error);
      return { error: String(error) };
    }
  },
});
