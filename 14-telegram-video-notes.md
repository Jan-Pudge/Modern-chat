# Інструкція 14: Відеокружечки в чаті (Telegram Video Notes з expo-camera, expo-video & Convex Storage)

У цій інструкції ми реалізуємо одну з найпопулярніших функцій сучасних месенджерів (Telegram, Instagram) у нашому додатку **Modern Chat**:
запис, завантаження у хмару та плавне відтворення **відеоповідомлень у кружечку (Video Notes)**.

> [!IMPORTANT]
> **Сучасний медіа-стек:**  
> - Для зйомки відео використовується найновіший компонент **`CameraView`** з офіційного пакета **`expo-camera`**.
> - Для відтворення відео використовується сучасний модульний пакет **`expo-video`** (`VideoView` та `useVideoPlayer`).
> - Для анімованого кругового прогрес-бару використовується **`react-native-svg`**.

---

## Зміст

1. [Архітектура та принцип роботи відеокружечків](#архітектура-та-принцип-роботи-відеокружечків)
2. [Крок 1: Встановлення бібліотек та налаштування дозволів у `app.json`](#крок-1-встановлення-бібліотек-та-налаштування-дозволів-у-appjson)
3. [Крок 2: Оновлення схеми бази даних у `convex/schema.ts`](#крок-2-оновлення-схеми-бази-даних-у-convexschemats)
4. [Крок 3: Серверні мутації у `convex/messages.ts`](#крок-3-серверні-мутації-у-convexmessagests)
5. [Крок 4: Створення компонента запису `components/VideoNoteRecorder.tsx`](#крок-4-створення-компонента-запису-componentsvideonoterecordertsx)
6. [Крок 5: Створення круглого відеоплеєра `components/VideoNotePlayer.tsx`](#крок-5-створення-круглого-відеоплеєра-componentsvideonoteplayertsx)
7. [Крок 6: Відображення кружечка у бульбашці `components/MessageBubble.tsx`](#крок-6-відображення-кружечка-у-бульбашці-componentsmessagebubbletsx)
8. [Крок 7: Кнопка запуску запису у `components/ChatInput.tsx`](#крок-7-кнопка-запуску-запису-у-componentschatinputtsx)
9. [Повні оновлені лістинги файлів](#повні-оновлені-лістинги-файлів)
10. [Тестування та перевірка роботи](#тестування-та-перевірка-роботи)

---

## Архітектура та принцип роботи відеокружечків

```
[Користувач тапає іконку камери у ChatInput]
               │
               ▼
[Відкривається модальне вікно VideoNoteRecorder]
  ├── Округле вікно CameraView з aspect-square та rounded-full
  ├── Таймер відліку до 60 секунд
  └── Перемикач фронтальної / основної камери
               │
               ▼
[Запис завершено: отримано локальний videoUri]
               │
               ▼
[Завантаження у Convex Storage через uploadUrl] ──► Повертає storageId
               │
               ▼
[Мутація api.messages.sendVideoNoteMessage]
  └── Зберігає { chatRoomId, videoUrl, videoStorageId, videoDuration, isVideoNote: true }
               │
               ▼
[MessageBubble ──► VideoNotePlayer]
  ├── Круглий контейнер з обрізанням overflow-hidden
  ├── useVideoPlayer: автовідтворення в зацикленому режимі
  ├── Круговий прогрес-бар SVG навколо відео
  └── Тап по кружечку: увімкнення / вимкнення звуку
```

---

## Крок 1: Встановлення бібліотек та налаштування дозволів у `app.json`

### 1.1 Встановлення пакетів

Зупиніть dev-сервер (`Ctrl + C`) та виконайте команду:

```bash
npx expo install expo-camera expo-video react-native-svg
```

### 1.2 Додавання системних дозволів у `app.json`

Для запису відео зі звуком потрібні системні дозволи для камери та мікрофона.
Відкрийте файл `app.json` та переконайтеся, що секція `plugins` містить налаштування:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Modern Chat потрібен доступ до камери для запису відеокружечків.",
          "microphonePermission": "Modern Chat потрібен доступ до мікрофона для запису звуку у відеокружечках."
        }
      ]
    ],
    "android": {
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO"
      ]
    },
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "Modern Chat потрібен доступ до камери для запису відеокружечків.",
        "NSMicrophoneUsageDescription": "Modern Chat потрібен доступ до мікрофона для запису звуку у відеокружечках."
      }
    }
  }
}
```

---

## Крок 2: Оновлення схеми бази даних у `convex/schema.ts`

Відкрийте файл `convex/schema.ts`. Додайте до таблиці `messages` поля для відео:

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ... інші таблиці

  messages: defineTable({
    chatRoomId: v.id("chatRooms"),
    senderId: v.id("users"),
    text: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    
    // Поля для голосових повідомлень:
    audioUrl: v.optional(v.string()),
    audioStorageId: v.optional(v.id("_storage")),
    audioDuration: v.optional(v.number()),

    // 📹 Нові поля для відеокружечків:
    videoUrl: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    videoDuration: v.optional(v.number()),
    isVideoNote: v.optional(v.boolean()),

    createdAt: v.number(),
  })
    .index("by_chat_room", ["chatRoomId"])
    .index("by_sender", ["senderId"]),
});
```

---

## Крок 3: Серверні мутації у `convex/messages.ts`

Відкрийте файл `convex/messages.ts` та додайте мутацію надсилання відеокружечка:

```typescript
// convex/messages.ts

/**
 * Надсилає відеоповідомлення у кружечку в чат-кімнату
 */
export const sendVideoNoteMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    videoStorageId: v.id("_storage"),
    videoDuration: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Необхідно авторизуватися");
    }

    // Отримуємо публічний URL відео з Convex Storage
    const videoUrl = await ctx.storage.getUrl(args.videoStorageId);
    if (!videoUrl) {
      throw new Error("Не вдалося отримати URL відеофайлу");
    }

    // Зберігаємо повідомлення в базі
    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      videoUrl,
      videoStorageId: args.videoStorageId,
      videoDuration: args.videoDuration,
      isVideoNote: true,
      createdAt: Date.now(),
    });

    // Оновлюємо час останньої активності в кімнаті (якщо є поле lastMessageAt)
    await ctx.db.patch(args.chatRoomId, {
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});
```

---

## Крок 4: Створення компонента запису `components/VideoNoteRecorder.tsx`

Створіть файл `components/VideoNoteRecorder.tsx`.
Цей компонент відкриває повноекранне модальне вікно з круглим вікном візирного видошукача, перемикачем фронтальної/основної камери та кнопками запису/скасування:

```tsx
// components/VideoNoteRecorder.tsx
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

type VideoNoteRecorderProps = {
  visible: boolean;
  onClose: () => void;
  onSendVideo: (videoUri: string, duration: number) => Promise<void>;
};

export const VideoNoteRecorder = ({
  visible,
  onClose,
  onSendVideo,
}: VideoNoteRecorderProps) => {
  const [cameraFacing, setCameraFacing] = useState<CameraType>("front");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const handleStartRecording = async () => {
    if (!cameraPermission?.granted) {
      const cam = await requestCameraPermission();
      if (!cam.granted) {
        Alert.alert("Помилка", "Дозвольте доступ до камери для запису кружечка");
        return;
      }
    }

    if (!micPermission?.granted) {
      const mic = await requestMicPermission();
      if (!mic.granted) {
        Alert.alert("Помилка", "Дозвольте доступ до мікрофона для запису звуку");
        return;
      }
    }

    if (!cameraRef.current || isRecording) return;

    try {
      setIsRecording(true);
      setRecordSeconds(0);

      // Запуск таймера
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 59) {
            handleStopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

      const videoRecordPromise = cameraRef.current.recordAsync({
        maxDuration: 60,
      });

      const video = await videoRecordPromise;

      if (video?.uri) {
        setIsProcessing(true);
        await onSendVideo(video.uri, recordSeconds || 1);
        setIsProcessing(false);
        handleClose();
      }
    } catch (error) {
      console.error("Помилка запису відео:", error);
      Alert.alert("Помилка", "Не вдалося записати відео");
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const handleStopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
    }
  };

  const handleClose = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordSeconds(0);
    setIsProcessing(false);
    onClose();
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${mins}:${remaining < 10 ? "0" : ""}${remaining}`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 bg-black/90 justify-center items-center px-4">
        {/* Кнопка закриття */}
        <TouchableOpacity
          onPress={handleClose}
          disabled={isRecording || isProcessing}
          className="absolute top-12 right-6 p-2 rounded-full bg-white/10"
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Таймер запису */}
        <View className="mb-6 items-center">
          <View className="flex-row items-center bg-black/60 px-4 py-1.5 rounded-full border border-white/20">
            {isRecording && <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2 animate-pulse" />}
            <Text className="text-white font-mono text-base">
              {formatSeconds(recordSeconds)} / 1:00
            </Text>
          </View>
        </View>

        {/* Кругле вікно камери */}
        <View className="w-72 h-72 rounded-full overflow-hidden border-4 border-primary items-center justify-center bg-surface relative">
          <CameraView
            ref={cameraRef}
            style={{ width: "100%", height: "100%" }}
            facing={cameraFacing}
            mode="video"
          />

          {isProcessing && (
            <View className="absolute inset-0 bg-black/70 items-center justify-center">
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text className="text-white text-xs font-semibold mt-2">Обробка відео...</Text>
            </View>
          )}
        </View>

        {/* Панель керування: перемикання камери та кнопка запису */}
        <View className="flex-row items-center justify-center gap-8 mt-10">
          {/* Перемикач передня/задня камера */}
          <TouchableOpacity
            disabled={isRecording || isProcessing}
            onPress={() => setCameraFacing((prev) => (prev === "front" ? "back" : "front"))}
            className="w-12 h-12 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
          >
            <Ionicons name="camera-reverse-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Кнопка Старт / Стоп запису */}
          <TouchableOpacity
            onPress={isRecording ? handleStopRecording : handleStartRecording}
            disabled={isProcessing}
            activeOpacity={0.8}
            className={`w-20 h-20 rounded-full items-center justify-center border-4 ${
              isRecording ? "border-red-500 bg-red-500/30" : "border-white bg-primary"
            }`}
          >
            <Ionicons
              name={isRecording ? "stop" : "radio-button-on"}
              size={36}
              color={isRecording ? "#EF4444" : "#FFFFFF"}
            />
          </TouchableOpacity>

          {/* Заглушка для симетрії */}
          <View className="w-12 h-12" />
        </View>
      </View>
    </Modal>
  );
};
```

---

## Крок 5: Створення круглого відеоплеєра `components/VideoNotePlayer.tsx`

Створіть файл `components/VideoNotePlayer.tsx`.
Цей компонент відображає отриманий відеокружечок з автовідтворенням без звуку, а при тапі вмикає звук та показує круговий SVG прогрес-бар навколо відео:

```tsx
// components/VideoNotePlayer.tsx
import React, { useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import Svg, { Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

type VideoNotePlayerProps = {
  videoUrl: string;
  duration?: number;
  size?: number;
};

export const VideoNotePlayer = ({
  videoUrl,
  duration = 0,
  size = 200,
}: VideoNotePlayerProps) => {
  const [isMuted, setIsMuted] = useState(true);
  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Створюємо та налаштовуємо плеєр через офіційний хук useVideoPlayer
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = isMuted;
    p.play();
  });

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (player) {
      player.muted = nextMute;
    }
  };

  // Розраховуємо прогрес відтворення для кругового індикатора
  const currentProgress =
    duration > 0 && player?.currentTime
      ? Math.min(1, player.currentTime / duration)
      : 0;
  const strokeDashoffset = circumference - currentProgress * circumference;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={toggleMute}
      style={{ width: size, height: size }}
      className="relative items-center justify-center"
    >
      {/* Кругле вікно відео */}
      <View
        style={{ width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }}
        className="overflow-hidden bg-surfaceLight items-center justify-center"
      >
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          nativeControls={false}
        />
      </View>

      {/* Круговий SVG-індикатор тривалості */}
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {/* Фонове кільце */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Активне кільце прогресу */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.primary}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Індикатор звуку в центрі або кутку */}
      <View className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded-full flex-row items-center gap-1">
        <Ionicons
          name={isMuted ? "volume-mute" : "volume-high"}
          size={12}
          color="#FFFFFF"
        />
        {duration > 0 && (
          <Text className="text-[10px] text-white font-mono">
            {Math.round(duration)}s
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};
```

---

## Крок 6: Відображення кружечка у бульбашці `components/MessageBubble.tsx`

Відкрийте файл `components/MessageBubble.tsx` та імпортуйте `VideoNotePlayer`:

```tsx
// components/MessageBubble.tsx
import { VideoNotePlayer } from "./VideoNotePlayer";

// Всередині MessageBubble:
{message.videoUrl && message.isVideoNote ? (
  <View className="my-1 items-center justify-center p-1">
    <VideoNotePlayer
      videoUrl={message.videoUrl}
      duration={message.videoDuration}
      size={210}
    />
  </View>
) : (
  // ... звичайний текст, картинка або аудіоповідомлення
)}
```

> [!TIP]
> Відеокружечки в месенджерах зазвичай відображаються **без фонової бульбашки** або з мінімальним прозорим контейнером, щоб зберегти круглу форму, притаманну кружечкам Telegram.

---

## Крок 7: Кнопка запуску запису у `components/ChatInput.tsx`

Відкрийте файл `components/ChatInput.tsx`:

1. Додайте стан `isVideoRecorderVisible`:
   ```tsx
   const [isVideoRecorderVisible, setIsVideoRecorderVisible] = useState(false);
   ```

2. Підключіть мутації генерації посилання `generateUploadUrl` та надсилання `sendVideoNoteMessage`:
   ```tsx
   const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
   const sendVideoNote = useMutation(api.messages.sendVideoNoteMessage);

   const handleSendVideoNote = async (videoUri: string, duration: number) => {
     try {
       // 1. Отримуємо URL для завантаження
       const uploadUrl = await generateUploadUrl();

       // 2. Читаємо файл і завантажуємо в Convex Storage
       const response = await fetch(videoUri);
       const blob = await response.blob();

       const result = await fetch(uploadUrl, {
         method: "POST",
         headers: { "Content-Type": "video/mp4" },
         body: blob,
       });

       const { storageId } = await result.json();

       // 3. Зберігаємо повідомлення в базі
       await sendVideoNote({
         chatRoomId,
         videoStorageId: storageId,
         videoDuration: duration,
       });
     } catch (error) {
       console.error("Помилка надсилання відеокружечка:", error);
       Alert.alert("Помилка", "Не вдалося надіслати відеоповідомлення");
     }
   };
   ```

3. Додайте кнопку виклику запису кружечка поруч із мікрофоном:
   ```tsx
   <TouchableOpacity
     onPress={() => setIsVideoRecorderVisible(true)}
     className="p-2 active:opacity-70"
   >
     <Ionicons name="videocam-outline" size={24} color={COLORS.primary} />
   </TouchableOpacity>
   ```

4. Додайте компонент рекордера внизу форми:
   ```tsx
   <VideoNoteRecorder
     visible={isVideoRecorderVisible}
     onClose={() => setIsVideoRecorderVisible(false)}
     onSendVideo={handleSendVideoNote}
   />
   ```

---

## Повні оновлені лістинги файлів

Перевірте, що створені або оновлені файли:
- [`convex/schema.ts`](#крок-2-оновлення-схеми-бази-даних-у-convexschemats) — поля `videoUrl`, `videoStorageId`, `videoDuration`, `isVideoNote`.
- [`convex/messages.ts`](#крок-3-серверні-мутації-у-convexmessagests) — мутація `sendVideoNoteMessage`.
- [`components/VideoNoteRecorder.tsx`](#крок-4-створення-компонента-запису-componentsvideonoterecordertsx) — модалка зйомки кружечка.
- [`components/VideoNotePlayer.tsx`](#крок-5-створення-круглого-відеоплеєра-componentsvideonoteplayertsx) — круглий плеєр із прогресом.
- [`components/MessageBubble.tsx`](#крок-6-відображення-кружечка-у-бульбашці-componentsmessagebubbletsx) — відображення кружечка у чаті.
- [`components/ChatInput.tsx`](#крок-7-кнопка-запуску-запису-у-componentschatinputtsx) — кнопка виклику запису.

---

## Тестування та перевірка роботи

1. Відкрийте кімнату чату в додатку Modern Chat.
2. Натисніть на іконку відеокамери в панелі вводу.
3. Надайте дозволи для камери та мікрофона.
4. Натисніть кнопку запису — переконайтеся, що таймер почав відлік, а індикатор запису блимає.
5. Запишіть відео на 5–10 секунд і натисніть кнопку зупинки.
6. Переконайтеся, що відео успішно завантажилося в Convex Storage і з'явилося в чаті у вигляді стильного круглого повідомлення.
7. Тапніть на кружечок — звук повинен увімкнутися/вимкнутися, а круговий індикатор відображати прогрес.
