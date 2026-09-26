# Інструкція 12: Голосові повідомлення в чаті (expo-audio & Convex Storage)

У цій інструкції ми реалізуємо функціонал запису, надсилання та прослуховування **голосових аудіоповідомлень (Voice Messages)** у додатку **Modern Chat**.

> [!IMPORTANT]
> **Сучасний аудіо-стек:**  
> Ми використовуємо новий офіційний модульний пакет **`expo-audio`** замість застарілого `expo-av`.  
> `expo-audio` надає зручні хуки `useAudioRecorder`, `useAudioRecorderState`, `useAudioPlayer`, `useAudioPlayerStatus`, які автоматично керують життєвим циклом аудіоресурсів та не викликають витоків пам'яті.

---

## Зміст

1. [Архітектура та життєвий цикл голосових повідомлень](#архітектура-та-життєвий-цикл-голосових-повідомлень)
2. [Крок 1: Встановлення `expo-audio` та налаштування дозволів](#крок-1-встановлення-expo-audio-та-налаштування-дозволів)
3. [Крок 2: Оновлення схеми бази даних у `convex/schema.ts`](#крок-2-оновлення-схеми-бази-даних-у-convexschemats)
4. [Крок 3: Оновлення мутацій надсилання повідомлень у `convex/messages.ts`](#крок-3-оновлення-мутацій-надсилання-повідомлень-у-convexmessagests)
5. [Крок 4: Створення компонента плеєра `components/VoiceMessagePlayer.tsx`](#крок-4-створення-компонента-плеєра-componentsvoicemessageplayertsx)
6. [Крок 5: Підключення плеєра до `components/MessageBubble.tsx`](#крок-5-підключення-плеєра-до-componentsmessagebubbletsx)
7. [Крок 6: Додавання інтерфейсу запису звуку в `components/ChatInput.tsx`](#крок-6-додавання-інтерфейсу-запису-звуку-в-componentschatinputtsx)
8. [Повні оновлені лістинги файлів](#повні-оновлені-лістинги-файлів)
9. [Тестування та перевірка роботи](#тестування-та-перевірка-роботи)

---

## Архітектура та життєвий цикл голосових повідомлень

```
[Користувач затискає або тапає "Мікрофон" у ChatInput]
               │
               ▼
[useAudioRecorder + useAudioRecorderState] ──► Запис аудіопотоку у форматі .m4a
               │
               ▼
[Отримання uploadUrl через api.messages.generateUploadUrl]
               │
               ▼
[Завантаження файлу в Convex Storage методом POST] ──► Повертає storageId
               │
               ▼
[Мутація api.messages.sendAudioMessage] ──► Зберігає audioUrl, audioStorageId, audioDuration
               │
               ▼
[Реактивне оновлення useQuery у списку повідомлень чату]
               │
               ▼
[MessageBubble ──► VoiceMessagePlayer] ──► Відтворення Play/Pause через useAudioPlayer
```

---

## Крок 1: Встановлення `expo-audio` та налаштування дозволів

### 1.1 Встановлення пакета

Зупиніть локальний сервер (`Ctrl + C`) та встановіть бібліотеку:

```bash
npx expo install expo-audio
```

### 1.2 Налаштування дозволів на використання мікрофона

Для доступу до мікрофона на Android та iOS необхідно додати відповідні дозволи.

Відкрийте файл `app.json` (або `app.config.ts`) та додайте плагін `expo-audio`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-audio",
        {
          "microphonePermission": "Додатку Modern Chat потрібен доступ до вашого мікрофона для запису та надсилання голосових повідомлень."
        }
      ]
    ],
    "android": {
      "permissions": [
        "android.permission.RECORD_AUDIO"
      ]
    },
    "ios": {
      "infoPlist": {
        "NSMicrophoneUsageDescription": "Додатку Modern Chat потрібен доступ до вашого мікрофона для запису та надсилання голосових повідомлень."
      }
    }
  }
}
```

---

## Крок 2: Оновлення схеми бази даних у `convex/schema.ts`

Відкрийте файл `convex/schema.ts` і додайте до таблиці `messages` поля для збереження голосових файлів:

```typescript
// convex/schema.ts (фрагмент таблиці messages)
  messages: defineTable({
    chatRoomId: v.id("chatRooms"),
    senderId: v.id("users"),
    senderName: v.string(),
    senderPhoto: v.optional(v.string()),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    isEdited: v.optional(v.boolean()),

    // Цитування повідомлень (з ДЗ 9)
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),

    // 👈 Нові поля для голосових повідомлень:
    audioUrl: v.optional(v.string()),
    audioStorageId: v.optional(v.id("_storage")),
    audioDuration: v.optional(v.number()), // тривалість у секундах
  }).index("by_chat_room", ["chatRoomId"]),
```

---

## Крок 3: Оновлення мутацій надсилання повідомлень у `convex/messages.ts`

Відкрийте файл `convex/messages.ts` та додайте мутацію `sendAudioMessage` (або розширте існуючу функцію):

```typescript
// convex/messages.ts

/**
 * Мутація для відправки голосового повідомлення
 */
export const sendAudioMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    audioStorageId: v.id("_storage"),
    audioDuration: v.number(),
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Необхідно авторизуватися");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Користувача не знайдено");
    }

    // Отримуємо публічне посилання на аудіофайл зі сховища
    const audioUrl = await ctx.storage.getUrl(args.audioStorageId);
    if (!audioUrl) {
      throw new Error("Не вдалося отримати URL аудіофайлу");
    }

    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? user.email.split("@")[0],
      senderPhoto: user.image ?? undefined,
      audioUrl,
      audioStorageId: args.audioStorageId,
      audioDuration: args.audioDuration,
      replyToId: args.replyToId,
      replyToSender: args.replyToSender,
      replyToText: args.replyToText,
    });

    // Оновлюємо останнє повідомлення у кімнаті
    await ctx.db.patch(args.chatRoomId, {
      lastMessage: "🎤 Голосове повідомлення",
      lastMessageTime: Date.now(),
      lastMessageSender: user.name ?? user.email.split("@")[0],
    });

    return messageId;
  },
});
```

Також переконайтеся, що у вас є мутація для генерації URL завантаження у сховище:

```typescript
// convex/messages.ts
export const generateUploadUrl = mutation(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Необхідно авторизуватися");
  }
  return await ctx.storage.generateUploadUrl();
});
```

---

## Крок 4: Створення компонента плеєра `components/VoiceMessagePlayer.tsx`

Створіть файл `components/VoiceMessagePlayer.tsx`:

```tsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

interface VoiceMessagePlayerProps {
  audioUrl: string;
  duration?: number;
  isMyMessage?: boolean;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  audioUrl,
  duration = 0,
  isMyMessage = false,
}) => {
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);

  const togglePlayPause = () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const effectiveDuration = status.duration > 0 ? status.duration : duration;
  const progress = effectiveDuration > 0 ? status.currentTime / effectiveDuration : 0;

  return (
    <View className="flex-row items-center gap-3 py-1 px-1 min-w-[210px]">
      {/* Кнопка Play / Pause */}
      <TouchableOpacity
        onPress={togglePlayPause}
        className={`w-10 h-10 rounded-full items-center justify-center active:opacity-80 ${
          isMyMessage ? "bg-white" : "bg-primary"
        }`}
      >
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={20}
          color={isMyMessage ? COLORS.primary : "#FFFFFF"}
          style={{ marginLeft: status.playing ? 0 : 2 }}
        />
      </TouchableOpacity>

      {/* Шкала прогресу та таймер */}
      <View className="flex-1 justify-center">
        <View
          className={`h-1.5 rounded-full overflow-hidden mb-1.5 ${
            isMyMessage ? "bg-white/30" : "bg-surfaceLight"
          }`}
        >
          <View
            className={`h-full rounded-full ${
              isMyMessage ? "bg-white" : "bg-primary"
            }`}
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </View>

        <View className="flex-row justify-between items-center">
          <Text
            className={`text-xs ${
              isMyMessage ? "text-white/80" : "text-grey"
            }`}
          >
            {formatTime(status.currentTime || 0)}
          </Text>
          <Text
            className={`text-xs ${
              isMyMessage ? "text-white/80" : "text-grey"
            }`}
          >
            {formatTime(effectiveDuration)}
          </Text>
        </View>
      </View>

      {/* Іконка мікрофона */}
      <Ionicons
        name="mic"
        size={16}
        color={isMyMessage ? "rgba(255,255,255,0.7)" : COLORS.primary}
      />
    </View>
  );
};
```

---

## Крок 5: Підключення плеєра до `components/MessageBubble.tsx`

Відкрийте `components/MessageBubble.tsx` та додайте відображення голосового повідомлення:

```tsx
// components/MessageBubble.tsx
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

// Всередині компонента MessageBubble, у блоці контенту:
{message.audioUrl && (
  <View className="my-1">
    <VoiceMessagePlayer
      audioUrl={message.audioUrl}
      duration={message.audioDuration}
      isMyMessage={isMyMessage}
    />
  </View>
)}
```

---

## Крок 6: Додавання інтерфейсу запису звуку в `components/ChatInput.tsx`

Відкрийте `components/ChatInput.tsx`. Додамо роботу з хуками `useAudioRecorder` та `useAudioRecorderState` з пакета `expo-audio`:

```tsx
import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { COLORS } from "@/constants/theme";

interface ChatInputProps {
  chatRoomId: Id<"chatRooms">;
  replyTo?: {
    id: Id<"messages">;
    sender: string;
    text: string;
  } | null;
  onCancelReply?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  chatRoomId,
  replyTo,
  onCancelReply,
}) => {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Ініціалізація аудіорекордера з налаштуваннями високої якості
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const sendAudioMessage = useMutation(api.messages.sendAudioMessage);
  const sendMessage = useMutation(api.messages.sendMessage);

  // Старт запису
  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Дозвіл не надано",
        "Для запису голосових повідомлень потрібен доступ до мікрофона."
      );
      return;
    }

    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      console.error("Помилка початку запису:", error);
      Alert.alert("Помилка", "Не вдалося розпочати запис аудіо.");
    }
  };

  // Скасування запису
  const cancelRecording = async () => {
    try {
      await audioRecorder.stop();
    } catch (error) {
      console.error("Помилка скасування запису:", error);
    }
  };

  // Зупинка та надсилання запису
  const stopAndSendRecording = async () => {
    try {
      const durationSeconds = Math.round(
        (recorderState.durationMillis || 0) / 1000
      );

      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri || durationSeconds < 1) {
        Alert.alert("Занадто коротке", "Голосове повідомлення занадто коротке.");
        return;
      }

      setIsSending(true);

      // 1. Отримуємо одноразовий URL для завантаження у Convex Storage
      const uploadUrl = await generateUploadUrl();

      // 2. Читаємо локальний аудіофайл та завантажуємо
      const response = await fetch(uri);
      const blob = await response.blob();

      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "audio/m4a" },
        body: blob,
      });

      const { storageId } = await uploadResult.json();

      // 3. Зберігаємо повідомлення в базі
      await sendAudioMessage({
        chatRoomId,
        audioStorageId: storageId,
        audioDuration: durationSeconds,
        replyToId: replyTo?.id,
        replyToSender: replyTo?.sender,
        replyToText: replyTo?.text,
      });

      if (onCancelReply) onCancelReply();
    } catch (error) {
      console.error("Помилка завантаження аудіо:", error);
      Alert.alert("Помилка", "Не вдалося надіслати голосове повідомлення.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendText = async () => {
    if (!text.trim() || isSending) return;
    try {
      setIsSending(true);
      await sendMessage({
        chatRoomId,
        content: text.trim(),
        replyToId: replyTo?.id,
        replyToSender: replyTo?.sender,
        replyToText: replyTo?.text,
      });
      setText("");
      if (onCancelReply) onCancelReply();
    } finally {
      setIsSending(false);
    }
  };

  const recordingSeconds = Math.floor(
    (recorderState.durationMillis || 0) / 1000
  );

  return (
    <View className="bg-surface border-t border-surfaceLight p-3">
      {/* Інтерфейс активного запису */}
      {recorderState.isRecording ? (
        <View className="flex-row items-center justify-between bg-surfaceLight/60 px-4 py-2.5 rounded-2xl">
          <View className="flex-row items-center gap-3">
            <View className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <Text className="text-white font-medium">
              Запис: {recordingSeconds} с
            </Text>
          </View>

          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={cancelRecording}
              className="p-2 active:opacity-70"
            >
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={stopAndSendRecording}
              className="w-10 h-10 rounded-full bg-primary items-center justify-center active:opacity-80"
            >
              <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Звичайний інпут тексту та кнопки виклику мікрофона */
        <View className="flex-row items-center gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Напишіть повідомлення..."
            placeholderTextColor="#666"
            className="flex-1 bg-surfaceLight text-white px-4 py-3 rounded-2xl text-base max-h-24"
            multiline
          />

          {text.trim().length > 0 ? (
            <TouchableOpacity
              onPress={handleSendText}
              disabled={isSending}
              className="w-11 h-11 rounded-full bg-primary items-center justify-center active:opacity-80"
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="arrow-up" size={22} color="#FFF" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={startRecording}
              className="w-11 h-11 rounded-full bg-surfaceLight items-center justify-center active:opacity-80"
            >
              <Ionicons name="mic" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};
```

---

## Повні оновлені лістинги файлів

Перевірте, що всі компоненти створені та підключені:
- `components/VoiceMessagePlayer.tsx`
- `components/ChatInput.tsx`
- `components/MessageBubble.tsx`
- `convex/schema.ts`
- `convex/messages.ts`

---

## Тестування та перевірка роботи

1. Відкрийте чат на фізичному пристрої або в симуляторі.
2. Натисніть на значок мікрофона біля інпуту та надайте додатку дозвіл.
3. Переконайтеся, що інпут змінився на червоний індикатор запису та показує секунди.
4. Натисніть кнопку надсилання (`arrow-up`).
5. У чаті з'явиться аудіобульбашка. Натисніть **Play** та перевірте звук і рух шкали прогресу.
