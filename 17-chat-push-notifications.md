# Інструкція 17: Push-сповіщення у месенджері Modern Chat 🔔💬⚡️

У цій інструкції ми інтегруємо повноцінну систему **Push-сповіщень** до нашого месенджера **Modern Chat**.

Тепер користувачі отримуватимуть системні пуш-сповіщення у фоновому режимі або при закритому додатку, а натискання на сповіщення миттєво відкриватиме потрібний чат (**Deep Linking**):
1. **Нове повідомлення в кімнаті** 💬 — надходить усім учасникам чату з текстом або типом медіа (фото, аудіо, кружечок). Натискання відкриває екран кімнати `/(app)/chat/[id]`.
2. **Відповідь на ваше повідомлення (Reply)** ↩️ — окреме персональне сповіщення з цитатою, коли хтось відповів саме вам.
3. **Реакція на повідомлення (Emoji Reaction)** 👍❤️🔥 — сповіщення автору повідомлення про нову емодзі-реакцію.

---

## 🏗 Архітектура доставки сповіщень у чаті

```
[Подія в Modern Chat] (Нове повідомлення / Відповідь / Емодзі-реакція)
        │
        ▼
[Convex Mutation] (sendMessage / sendMediaMessage / toggleReaction)
        │ 
        ├─► Збереження повідомлення або реакції в базі даних Convex
        │
        ▼ (ctx.scheduler.runAfter(0, internal.pushNotifications.sendPushNotification, ...))
[Convex Internal Action] (sendPushNotification)
        │
        ▼ (HTTP POST JSON)
[Expo Push Service] (https://exp.host/--/api/v2/push/send)
        │
        ▼
[Firebase Cloud Messaging (FCM v1) для Android / APNs для iOS]
        │
        ▼
[Пристрій користувача] (Системна шторка, звук, вібрація, банер)
        │
        ▼ (Клік по сповіщенню у шторці)
[Deep Linking у usePushNotifications] ──► router.push('/(app)/chat/${roomId}')
```

---

## 📚 Зміст

1. [Крок 1: Встановлення необхідних залежностей](#крок-1-встановлення-необхідних-залежностей)
2. [Крок 2: Оновлення конфігурації `app.config.ts` (або `app.json`)](#крок-2-оновлення-конфігурації-appconfigts-або-appjson)
3. [Крок 3: Оновлення схеми бази даних `convex/schema.ts`](#крок-3-оновлення-схеми-бази-даних-convexschemats)
4. [Крок 4: Мутація збереження токена `convex/users.ts`](#крок-4-мутація-збереження-токена-convexusersts)
5. [Крок 5: Серверний сервіс відправки пушів `convex/pushNotifications.ts`](#крок-5-серверний-сервіс-відправки-пушів-convexpushnotificationsts)
6. [Крок 6: Відправка пушів при повідомленнях та відповідях у `convex/messages.ts`](#крок-6-відправка-пушів-при-повідомленнях-та-відповідях-у-convexmessagests)
7. [Крок 7: Відправка пушів при емодзі-реакціях у `convex/reactions.ts`](#крок-7-відправка-пушів-при-емодзі-реакціях-у-convexreactionsts)
8. [Крок 8: Клієнтський хук `hooks/usePushNotifications.ts` та Deep Linking](#крок-8-клієнтський-хук-hooksusepushnotificationsts-та-deep-linking)
9. [Крок 9: Підключення хука в `components/InitialLayout.tsx`](#крок-9-підключення-хука-в-componentsinitiallayouttsx)
10. [Крок 10: Налаштування Firebase FCM v1 для Android](#крок-10-налаштування-firebase-fcm-v1-для-android)
11. [Крок 11: Збірка додатка та тестування](#крок-11-збірка-додатка-та-тестування)
12. [Повні лістинги файлів](#повні-лістинги-файлів)
13. [Вирішення типових проблем (Troubleshooting)](#вирішення-типових-проблем-troubleshooting)

---

## Крок 1: Встановлення необхідних залежностей

У корені вашого проєкту **Modern Chat** встановіть бібліотеку `expo-notifications` та допоміжний пакет `expo-constants`:

```bash
npx expo install expo-notifications expo-constants
```

> [!IMPORTANT]
> Починаючи з Android 13 (API 33), операційна система вимагає явного дозволу `POST_NOTIFICATIONS`. Крім того, нативні пуш-сповіщення через FCM v1 **не працюють у стандартному клієнті Expo Go**. 
> Для тестування вам знадобиться **Development Build** (`npx expo run:android`) або автономний **Standalone APK**, який ви навчилися збирати у ДЗ 13!

---

## Крок 2: Оновлення конфігурації `app.config.ts` (або `app.json`)

Для роботи сповіщень на Android необхідно:
1. Зареєструвати плагін `expo-notifications` у секції `plugins`.
2. Додати системні дозволи `POST_NOTIFICATIONS` та `VIBRATE` у `android.permissions`.
3. Вказати шлях до файлу Firebase `googleServicesFile: "./google-services.json"`.
4. Вказати унікальний ідентифікатор пакету (`android.package`).
5. Додати `extra.eas.projectId` (потрібен Expo для генерації `ExponentPushToken`).

### Варіант А: Якщо ви використовуєте динамічний `app.config.ts` (з ДЗ 13)

Відкрийте `app.config.ts` та перевірте наявність наступних секцій:

```typescript
// app.config.ts
import { ConfigContext, ExpoConfig } from "expo/config";

const APP_NAME = "Modern Chat";
const PACKAGE_NAME = "com.modernchat.app";
const SCHEME = "modernchat";

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment =
    (process.env.APP_ENV as "development" | "preview" | "production") ||
    "development";

  const isDev = environment === "development";

  return {
    ...config,
    name: isDev ? `${APP_NAME} Dev` : APP_NAME,
    slug: "modern-chat",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: isDev ? `${SCHEME}-dev` : SCHEME,
    userInterfaceStyle: "dark",

    android: {
      package: isDev ? `${PACKAGE_NAME}.dev` : PACKAGE_NAME,
      googleServicesFile: "./google-services.json", // 👈 Файл конфігурації Firebase
      adaptiveIcon: {
        backgroundColor: "#111827",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.VIBRATE",             // 👈 Дозвіл вібрації для пушів
        "android.permission.POST_NOTIFICATIONS",   // 👈 Системний дозвіл пушів Android 13+
      ],
    },

    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#111827",
          image: "./assets/images/splash-icon.png",
          imageWidth: 100,
        },
      ],
      "expo-secure-store",
      [
        "expo-audio",
        {
          microphonePermission: "Modern Chat потребує доступ до мікрофона для запису голосових повідомлень.",
          recordAudioAndroid: true,
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission: "Modern Chat потребує доступ до камери для зйомки відеокружечків.",
          microphonePermission: "Modern Chat потребує доступ до мікрофона для запису відеокружечків.",
        },
      ],
      ["expo-video"],
      // 👇 Плагін конфігурації системних сповіщень Expo
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#2563EB",
          defaultChannel: "default",
        },
      ],
    ],

    extra: {
      ...config.extra,
      eas: {
        projectId: config.extra?.eas?.projectId ?? "ВАШ_EAS_PROJECT_ID",
      },
    },
  };
};
```

### Варіант Б: Якщо у вас використовується `app.json`

Якщо ви ще не переходили на `app.config.ts`, додайте плагін та налаштування у файл `app.json`:

```json
{
  "expo": {
    "name": "Modern Chat",
    "slug": "modern-chat",
    "android": {
      "package": "com.modernchat.app",
      "googleServicesFile": "./google-services.json",
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.VIBRATE",
        "android.permission.POST_NOTIFICATIONS"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-notifications",
        {
          "icon": "./assets/images/icon.png",
          "color": "#2563EB",
          "defaultChannel": "default"
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "ВАШ_EAS_PROJECT_ID"
      }
    }
  }
}
```

---

## Крок 3: Оновлення схеми бази даних `convex/schema.ts`

Для того, щоб бекенд знав, на які пристрої відправляти сповіщення, кожному користувачеві потрібно зберегти його `ExponentPushToken`.

Відкрийте файл `convex/schema.ts` та додайте поле `pushToken: v.optional(v.string())` до таблиці `users`:

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // Користувачі
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    // 👇 Нове поле: Expo Push Token для сповіщень
    pushToken: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // Чат-кімнати
  chatRooms: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    creatorId: v.id("users"),
    lastMessage: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
  }).index("by_creator", ["creatorId"]),

  // Повідомлення
  messages: defineTable({
    chatRoomId: v.id("chatRooms"),
    senderId: v.id("users"),
    senderName: v.string(),
    senderPhoto: v.optional(v.string()),
    content: v.string(),
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),
    // ... медіа-поля з ДЗ 8, 11, 12 якщо є:
    imageUrl: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    isVideoNote: v.optional(v.boolean()),
  }).index("by_chat_room", ["chatRoomId"]),

  // Інші таблиці проєкту (messageReactions, typingIndicators тощо)...
});
```

> [!NOTE]
> Оскільки поле `pushToken` позначено як `v.optional(...)`, жодних помилок чи міграцій для вже зареєстрованих користувачів робити не потрібно!

---

## Крок 4: Мутація збереження токена `convex/users.ts`

Створимо серверну мутацію `savePushToken`, яку наш мобільний додаток викликатиме при вході користувача після отримання дозволу на сповіщення.

Відкрийте `convex/users.ts` та додайте наступну функцію:

```typescript
// convex/users.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Зберігає або оновлює ExponentPushToken поточного авторизованого користувача
 */
export const savePushToken = mutation({
  args: {
    pushToken: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    // Оновлюємо токен поточного користувача
    await ctx.db.patch(userId, {
      pushToken: args.pushToken,
    });

    return { success: true };
  },
});
```

---

## Крок 5: Серверний сервіс відправки пушів `convex/pushNotifications.ts`

Створимо новий файл `convex/pushNotifications.ts`. У ньому реалізуємо внутрішній екшен (`internalAction`) для взаємодії з **Expo Push Service**.

> [!IMPORTANT]
> **Чому `internalAction`, а не звичайна `mutation`?**  
> Мутації в Convex виконуються в детермінованій транзакції та не мають права виконувати виклики `fetch()` до зовнішніх веб-серверів. `internalAction` запускається у середовищі Node.js, може вільно робити зовнішні HTTP-запити, а викликається з будь-якої мутації асинхронно через фоновий планувальник `ctx.scheduler.runAfter(0, ...)`.

Створіть файл `convex/pushNotifications.ts`:

```typescript
// convex/pushNotifications.ts
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
```

---

## Крок 6: Відправка пушів при повідомленнях та відповідях у `convex/messages.ts`

Тепер налаштуємо автоматичну відправку сповіщень при надсиланні нового повідомлення:
1. Якщо повідомлення є відповіддю на чиєсь повідомлення (`replyToId`) — автор оригінального повідомлення отримує персональний пуш: *"💬 [Ім'я] відповів(-ла) на ваше повідомлення..."*.
2. Решта учасників кімнати (хто раніше писав у цей чат або створив його) отримують сповіщення: *"[Ім'я] ([Назва кімнати]): [Текст повідомлення]"*.
3. Для медіа-повідомлень (якщо контент порожній або надсилається аудіо чи відеокружечок) формуємо зрозумілий текст: `"🎤 Голосове повідомлення"`, `"📹 Відеоповідомлення"` або `"📷 Фотографія"`.

Відкрийте `convex/messages.ts`, додайте імпорт `internal` та оновіть мутацію `sendMessage`:

```typescript
// convex/messages.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api"; // 👈 Додати імпорт внутрішнього API
import { Id } from "./_generated/dataModel";

export const sendMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    content: v.string(),
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found: Користувача не знайдено");
    }

    const trimmedContent = args.content.trim();
    if (!trimmedContent) {
      throw new Error("Message content cannot be empty");
    }

    // 1. Зберігаємо повідомлення в базі
    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? user.email ?? "Співрозмовник",
      senderPhoto: user.image,
      content: trimmedContent,
      replyToId: args.replyToId,
      replyToSender: args.replyToSender,
      replyToText: args.replyToText,
    });

    // 2. Оновлюємо інформацію про останнє повідомлення в кімнаті
    await ctx.db.patch(args.chatRoomId, {
      lastMessage: trimmedContent,
      lastMessageAt: Date.now(),
    });

    // 3. Відправка Push-сповіщень через фоновий планувальник
    const room = await ctx.db.get(args.chatRoomId);
    const senderName = user.name ?? user.email ?? "Співрозмовник";
    const roomTitle = room?.title ?? "Чат";

    let replyAuthorId: Id<"users"> | null = null;

    // СЦЕНАРІЙ А: Якщо це відповідь на чиєсь повідомлення (Reply)
    if (args.replyToId) {
      const originalMessage = await ctx.db.get(args.replyToId);
      if (originalMessage && originalMessage.senderId !== userId) {
        replyAuthorId = originalMessage.senderId;
        const originalAuthor = await ctx.db.get(originalMessage.senderId);

        if (originalAuthor?.pushToken) {
          await ctx.scheduler.runAfter(
            0,
            internal.pushNotifications.sendPushNotification,
            {
              pushToken: originalAuthor.pushToken,
              title: `💬 Відповідь від ${senderName}`,
              body: `${senderName} відповів(-ла) у "${roomTitle}": ${trimmedContent}`,
              data: {
                type: "reply",
                roomId: args.chatRoomId,
                messageId,
              },
            }
          );
        }
      }
    }

    // СЦЕНАРІЙ Б: Відправка решті учасників кімнати
    // Отримуємо повідомлення кімнати для визначення списку учасників
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.chatRoomId))
      .collect();

    const recipientIds = new Set<Id<"users">>();

    // Додаємо творця кімнати, якщо це не автор повідомлення
    if (room?.creatorId && room.creatorId !== userId && room.creatorId !== replyAuthorId) {
      recipientIds.add(room.creatorId);
    }

    // Додаємо всіх, хто писав у цю кімнату раніше
    for (const msg of recentMessages) {
      if (msg.senderId !== userId && msg.senderId !== replyAuthorId) {
        recipientIds.add(msg.senderId);
      }
    }

    // Відправляємо пуші всім знайденим учасникам
    for (const recipientId of recipientIds) {
      const recipient = await ctx.db.get(recipientId);
      if (recipient?.pushToken) {
        await ctx.scheduler.runAfter(
          0,
          internal.pushNotifications.sendPushNotification,
          {
            pushToken: recipient.pushToken,
            title: `${senderName} (${roomTitle})`,
            body: trimmedContent,
            data: {
              type: "message",
              roomId: args.chatRoomId,
              messageId,
            },
          }
        );
      }
    }

    return messageId;
  },
});
```

> [!TIP]
> Аналогічний блок відправки пуша ви можете додати у ваші мутації `sendAudioMessage` (голосові) та `sendVideoNoteMessage` (відеокружечки), передавши у поле `body` текст `"🎤 Голосове повідомлення"` або `"📹 Відеокружечок"`.

---

## Крок 7: Відправка пушів при емодзі-реакціях у `convex/reactions.ts`

Якщо у вашому додатку реалізовано швидкі реакції емодзі (з ДЗ 11), додамо пуш-сповіщення автору повідомлення, коли хтось ставить реакцію на його меседж!

Відкрийте `convex/reactions.ts` та додайте планувальник пуша всередину мутації `toggleReaction`:

```typescript
// convex/reactions.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api"; // 👈 Додати імпорт internal

export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found: Повідомлення не знайдено");
    }

    // Перевіряємо, чи користувач вже ставив цю реакцію
    const existing = await ctx.db
      .query("messageReactions")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", userId)
      )
      .filter((q) => q.eq(q.field("emoji"), args.emoji))
      .first();

    if (existing) {
      // Якщо вже стоїть — видаляємо її (зняття реакції)
      await ctx.db.delete(existing._id);
      return { action: "removed" };
    }

    // Додаємо нову реакцію
    await ctx.db.insert("messageReactions", {
      messageId: args.messageId,
      userId,
      emoji: args.emoji,
      createdAt: Date.now(),
    });

    // 👇 НАДСИЛАЄМО ПУШ АВТОРУ ПОВІДОМЛЕННЯ (якщо реакцію поставив інший користувач)
    if (message.senderId !== userId) {
      const messageAuthor = await ctx.db.get(message.senderId);
      const sender = await ctx.db.get(userId);
      const room = await ctx.db.get(message.chatRoomId);

      if (messageAuthor?.pushToken && sender) {
        const senderName = sender.name ?? sender.email ?? "Співрозмовник";
        const roomTitle = room?.title ?? "чаті";

        await ctx.scheduler.runAfter(
          0,
          internal.pushNotifications.sendPushNotification,
          {
            pushToken: messageAuthor.pushToken,
            title: `Нова реакція ${args.emoji}`,
            body: `${senderName} відреагував(ла) ${args.emoji} на ваше повідомлення у "${roomTitle}"`,
            data: {
              type: "reaction",
              roomId: message.chatRoomId,
              messageId: message._id,
            },
          }
        );
      }
    }

    return { action: "added" };
  },
});
```

---

## Крок 8: Клієнтський хук `hooks/usePushNotifications.ts` та Deep Linking

Тепер створимо клієнтський хук, який:
1. Запитує системний дозвіл на сповіщення у користувача.
2. Створює обов'язковий системний **Android Notification Channel** з високим пріоритетом, звуком та вібрацією.
3. Отримує унікальний `ExponentPushToken`.
4. Зберігає токен у базі Convex через мутацію `api.users.savePushToken`.
5. Налаштовує показ сповіщень у Foreground-режимі (коли додаток відкритий).
6. Реалізує **Deep Linking**: при натисканні на банер сповіщення (у фоні або при холодному запуску) додаток автоматично відкриває відповідну чат-кімнату:  
   👉 `router.push('/(app)/chat/${data.roomId}')`.

Створіть файл `hooks/usePushNotifications.ts`:

```typescript
// hooks/usePushNotifications.ts
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

/**
 * Налаштування поведінки сповіщень, коли додаток активний (Foreground).
 * Показуємо банер, граємо звук та додаємо вібрацію.
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
      // Перехід до відповідної кімнати чату
      router.push(`/(app)/chat/${targetRoomId}` as any);
    } else {
      // Якщо кімнати немає — повертаємося на головний список кімнат
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
    if (isLoading || !isAuthenticated) return;

    // Отримуємо токен та зберігаємо його в базі Convex
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        console.log("📲 Збереження Expo Push Token:", token);
        savePushToken({ pushToken: token }).catch((err) => {
          console.error("❌ Помилка збереження pushToken у Convex:", err);
        });
      }
    });

    // Слухач сповіщень, коли додаток відкрито на передньому плані (Foreground)
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("🔔 Отримано сповіщення у Foreground:", notification.request.content);
      });

    // Слухач натискання користувача на сповіщення (Background / Notification Bar)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        handleNotificationNavigation(data);
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated, isLoading]);
}

/**
 * Налаштування Android Notification Channel та отримання Push-токена
 */
async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Налаштування каналу для Android
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Повідомлення чату",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
      sound: "default",
    });
  }

  // Перевіряємо поточний статус дозволів
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Якщо дозволу ще немає — запитуємо у користувача
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("⚠️ Користувач відхилив запит на дозвіл для сповіщень");
    return null;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn("⚠️ Project ID не знайдено в app.config.ts / app.json (extra.eas.projectId)");
    }

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    return tokenData.data;
  } catch (error) {
    console.error("❌ Помилка отримання Expo Push Token:", error);
    return null;
  }
}
```

---

## Крок 9: Підключення хука в `components/InitialLayout.tsx`

Компонент `components/InitialLayout.tsx` є кореневим місцем автентифікації. Він запускається одразу після старту додатка і гарантує, що запит токена та його збереження в базі відбудуться тоді, коли користувач успішно залогінився.

Відкрийте `components/InitialLayout.tsx` та додайте виклик `usePushNotifications()`:

```tsx
// components/InitialLayout.tsx
import { useEffect } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import * as SplashScreen from "expo-splash-screen";
import { Stack, useRouter, useSegments } from "expo-router";
// 👇 ДОДАТИ ІМПОРТ ХУКА:
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function InitialLayout() {
  // 👇 ДОДАТИ ВИКЛИК ХУКА:
  usePushNotifications();

  const { isAuthenticated, isLoading } = useConvexAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthScreen = segments[0] === "(auth)";

    if (isAuthenticated) {
      if (inAuthScreen) {
        router.replace("/(app)");
      }
    } else {
      if (!inAuthScreen) {
        router.replace("/(auth)/login");
      }
    }

    SplashScreen.hideAsync();
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

---

## Крок 10: Налаштування Firebase FCM v1 для Android

Для доставки сповіщень на Android Google вимагає використання **Firebase Cloud Messaging (FCM v1)**.

### 10.1. Створення проєкту у Firebase Console
1. Перейдіть до [Firebase Console](https://console.firebase.google.com/) та натисніть **Add project** (наприклад, назвіть його `modern-chat`).
2. Додайте додаток **Android**:
   - Вкажіть **Android package name**, який прописаний у вашому `app.config.ts`:  
     `com.modernchat.app` (або `com.modernchat.app.dev`).
3. Завантажте файл **`google-services.json`** та покладіть його у **корінь вашого проєкту Modern Chat**:
   ```
   modern-chat/
   ├── google-services.json   👈 Тут у корені проєкту
   ├── app.config.ts
   ├── package.json
   ```

### 10.2. Генерація приватного ключа Service Account
1. У Firebase Console перейдіть у **Project settings** (шестерня вгорі ліворуч) ➔ вкладка **Service accounts**.
2. Переконайтеся, що вибрано **Firebase Admin SDK**.
3. Натисніть кнопку **Generate new private key** ➔ підтвердіть завантаження файлу JSON.

### 10.3. Завантаження ключа в Expo / EAS
1. Відкрийте панель облікових даних вашого проєкту в Expo:  
   👉 **`https://expo.dev/accounts/[ваш-акаунт]/projects/modern-chat/credentials`**
2. Виберіть платформу **Android** та натисніть на ваш пакет (`com.modernchat.app`).
3. Прокрутіть до блоку **FCM V1 service account key**.
4. Натисніть **Upload** та оберіть завантажений JSON-файл приватного ключа від Google.

---

## Крок 11: Збірка додатка та тестування

### Спосіб 1: Локальний запуск (Development Build)
```bash
npx expo run:android
```

### Спосіб 2: Локальна або EAS збірка APK (як у ДЗ 13)
```bash
npx eas-cli build --platform android --profile preview --local
```
або стандартна компіляція через Gradle:
```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
```

---

## 🧪 Сценарії тестування

### 1. Перевірка збереження токена в базі даних Convex
1. Запустіть додаток на смартфоні та увійдіть в акаунт.
2. При появі системного вікна натисніть **Дозволити сповіщення**.
3. Відкрийте **Convex Dashboard** ➔ вкладка **Data** ➔ таблиця **users**.
4. Переконайтеся, що у вашого користувача заповнилося поле `pushToken`:
   ```text
   ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
   ```

### 2. Тестова відправка через Expo Push Tool
1. Скопіюйте свій токен із Convex Dashboard.
2. Відкрийте онлайн-утиліту [Expo Push Notification Tool](https://expo.dev/notifications).
3. Вставте токен у поле **Expo Push Token**.
4. Заповніть тестові поля:
   - **Title:** `Modern Chat 🔔`
   - **Message:** `Привіт! Сповіщення працюють ідеально!`
   - **Data (JSON):** `{"roomId": "ID_ВАШОЇ_КІМНАТИ"}`
5. Натисніть **Send Notification**. Сповіщення має миттєво з'явитися у системній шторці Android!

### 3. Реальний чат між двома пристроями
1. Увійдіть у додаток з двох різних акаунтів (Користувач А на смартфоні, Користувач Б на іншому пристрої або в емуляторі).
2. На смартфоні Користувача А **згорніть додаток** на робочий стіл (або повністю закрийте).
3. З акаунту Користувача Б надішліть повідомлення в спільну кімнату.
4. **Результат:** На смартфоні Користувача А пролунає системний звук, спрацює вібрація та з'явиться банер зі сповіщенням.
5. Натисніть на сповіщення: додаток розгорнеться і **автоматично відкриє екран цієї кімнати**!

---

## Повні лістинги файлів

<details>
<summary><b>1. convex/pushNotifications.ts</b></summary>

```typescript
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const sendPushNotification = internalAction({
  args: {
    pushToken: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    if (!args.pushToken || !args.pushToken.startsWith("ExponentPushToken[")) {
      console.log("⚠️ Некоректний Expo pushToken:", args.pushToken);
      return { success: false, reason: "Invalid token" };
    }

    const message = {
      to: args.pushToken,
      sound: "default",
      title: args.title,
      body: args.body,
      data: args.data ?? {},
      priority: "high",
      channelId: "default",
    };

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
```
</details>

<details>
<summary><b>2. hooks/usePushNotifications.ts</b></summary>

```typescript
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const savePushToken = useMutation(api.users.savePushToken);
  const router = useRouter();

  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

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
    if (
      lastNotificationResponse &&
      lastNotificationResponse.actionIdentifier ===
        Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      const data = lastNotificationResponse.notification.request.content.data;
      handleNotificationNavigation(data);
    }
  }, [lastNotificationResponse]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        savePushToken({ pushToken: token }).catch((err) => {
          console.error("Помилка збереження pushToken у Convex:", err);
        });
      }
    });

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("🔔 Отримано сповіщення у Foreground:", notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        handleNotificationNavigation(data);
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated, isLoading]);
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Повідомлення чату",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
      sound: "default",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    return tokenData.data;
  } catch (error) {
    console.error("Не вдалося отримати pushToken:", error);
    return null;
  }
}
```
</details>

---

## Вирішення типових проблем (Troubleshooting)

1. **Помилка `Project ID not found`:**
   - Перевірте, чи додано блок `extra.eas.projectId` у ваш `app.config.ts` (або `app.json`). Значення `projectId` генерується автоматично командою `npx eas init` або доступне у вашому кабінеті на [expo.dev](https://expo.dev).

2. **Сповіщення не надходять на Android 13+:**
   - Перевірте, що у `android.permissions` прописано `"android.permission.POST_NOTIFICATIONS"`.
   - Зайдіть у **Налаштування телефону ➔ Програми ➔ Modern Chat ➔ Сповіщення** та переконайтеся, що перемикач увімкнено.

3. **Сповіщення не приходять у Expo Go:**
   - Expo Go не підтримує нативні FCM v1 сповіщення. Використовуйте **Development Build** (`npx expo run:android`) або зібраний **Standalone APK**.

4. **Токен не зберігається в Convex:**
   - Перевірте консоль терміналу. Виклик `savePushToken` має виконуватися лише тоді, коли `isAuthenticated === true`. Якщо ви викликаєте хук до авторизації, `getAuthUserId` поверне `null`.
