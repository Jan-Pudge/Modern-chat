# Інструкція 9: Відповіді на повідомлення та цитування (Message Replies & Swipe-to-Reply)

У цій інструкції ми реалізуємо функціонал відповідей на повідомлення (Reply / Quote) у стилі **Telegram** та **WhatsApp**. Студенти додадуть можливість свайпнути повідомлення праворуч для швидкої відповіді за допомогою **Gesture Handler & Reanimated**, панель цитування над полем вводу та стилізований блок цитати всередині бульбашки повідомлення.

---

## Зміст

1. [Крок 1: Оновлення схеми бази даних у convex/schema.ts](#крок-1-оновлення-схеми-бази-даних-у-convexschemats)
2. [Крок 2: Оновлення серверних мутацій у convex/messages.ts](#крок-2-оновлення-серверних-мутацій-у-convexmessagests)
3. [Крок 3: Створення компонента панелі цитування ReplyPreviewBar.tsx](#крок-3-створення-компонента-панелі-цитування-replypreviewbartsx)
4. [Крок 4: Створення компонента повідомлення SwipeableMessageItem.tsx](#крок-4-створення-компонента-повідомлення-swipeablemessageitemtsx)
5. [Крок 5: Інтеграція відповідей у екран чату app/chat/[id].tsx](#крок-5-інтеграція-відповідей-у-екран-чату-appchatidtsx)
6. [Повний лістинг components/SwipeableMessageItem.tsx](#повний-лістинг-componentsswipeablemessageitemtsx)
7. [Повний оновлений лістинг app/chat/[id].tsx](#повний-оновлений-лістинг-appchatidtsx)

---

## Крок 1: Оновлення схеми бази даних у `convex/schema.ts`

Для збереження інформації про цитоване повідомлення розширимо таблицю `messages`. Додамо три опціональні поля:
- `replyToId`: унікальний ідентифікатор повідомлення, на яке відповідають.
- `replyToSender`: ім'я автора оригінального повідомлення.
- `replyToText`: текст (або позначка "[Фото]") оригінального повідомлення.

Відкрийте файл `convex/schema.ts` та оновіть визначення таблиці `messages`:

```typescript
// convex/schema.ts
  messages: defineTable({
    chatRoomId: v.id("chatRooms"),
    senderId: v.id("users"),
    senderName: v.string(),
    senderPhoto: v.optional(v.string()),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    isEdited: v.optional(v.boolean()),

    // Нові поля для підтримки відповідей на повідомлення:
    replyToId: v.optional(v.id("messages")),
    replyToSender: v.optional(v.string()),
    replyToText: v.optional(v.string()),
  }).index("by_chat_room", ["chatRoomId"]),
```

---

## Крок 2: Оновлення серверних мутацій у `convex/messages.ts`

Оновимо мутації `sendMessage` та `sendMediaMessage`, додавши аргументи `replyToId`, `replyToSender` та `replyToText`.

Відкрийте `convex/messages.ts` та оновіть мутацію `sendMessage`:

```typescript
// convex/messages.ts

/**
 * Відправка нового текстового повідомлення з можливістю відповіді (reply)
 */
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

    // 1. Зберігаємо повідомлення разом із даними цитування
    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? user.email ?? "Користувач",
      senderPhoto: user.image,
      content: trimmedContent,
      replyToId: args.replyToId,
      replyToSender: args.replyToSender,
      replyToText: args.replyToText,
    });

    // 2. Оновлюємо інформацію про останнє повідомлення в кімнаті
    await ctx.db.patch(args.chatRoomId, {
      lastMessage: `${user.name ?? "Користувач"}: ${trimmedContent}`,
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});
```

Також оновіть `sendMediaMessage` у `convex/messages.ts`:

```typescript
/**
 * Відправка повідомлення з фотографією та можливістю цитування
 */
export const sendMediaMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
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
      throw new Error("Користувача не знайдено");
    }

    const imageUrl = await ctx.storage.getUrl(args.storageId);
    if (!imageUrl) {
      throw new Error("Не вдалося отримати посилання на збережений файл");
    }

    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? user.email ?? "Користувач",
      senderPhoto: user.image,
      content: args.caption?.trim() || undefined,
      imageUrl,
      storageId: args.storageId,
      replyToId: args.replyToId,
      replyToSender: args.replyToSender,
      replyToText: args.replyToText,
    });

    await ctx.db.patch(args.chatRoomId, {
      lastMessage: `${user.name ?? "Користувач"}: 📷 Фотографія`,
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});
```

---

## Крок 3: Створення компонента панелі цитування `ReplyPreviewBar.tsx`

Коли користувач відповідає на повідомлення, над полем введення з'являється компактна панель із підсвічуванням імені автора, фрагментом повідомлення та кнопкою скасування ("✕").

Створіть файл `components/ReplyPreviewBar.tsx`:

```tsx
// components/ReplyPreviewBar.tsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

export interface ReplyTarget {
  messageId: string;
  senderName: string;
  text: string;
}

interface ReplyPreviewBarProps {
  replyTarget: ReplyTarget;
  onCancel: () => void;
}

export const ReplyPreviewBar: React.FC<ReplyPreviewBarProps> = ({
  replyTarget,
  onCancel,
}) => {
  return (
    <View className="flex-row items-center justify-between px-4 py-2 bg-surfaceLight/95 border-t border-surface border-l-4 border-l-primary">
      <View className="flex-row items-center flex-1 mr-2">
        <Ionicons
          name="arrow-undo"
          size={18}
          color={COLORS.primary}
          style={{ marginRight: 8 }}
        />
        <View className="flex-1">
          <Text className="text-primary font-bold text-xs">
            Відповідь для {replyTarget.senderName}
          </Text>
          <Text className="text-white/80 text-xs mt-0.5" numberOfLines={1}>
            {replyTarget.text || "📷 Зображення"}
          </Text>
        </View>
      </View>

      <TouchableOpacity onPress={onCancel} className="p-1">
        <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
};
```

---

## Крок 4: Створення компонента повідомлення `SwipeableMessageItem.tsx`

Реалізуємо жест свайпу повідомлення вправо для швидкої відповіді:
- Коли користувач тягне повідомлення вправо (`translationX > 0`), зліва випливає синя іконка відповіді `arrow-undo-circle`.
- Якщо поріг зсуву досягає `50px`, спрацьовує виклик `onReply(message)` і бульбашка пружинно повертається на своє місце (`withSpring(0)`).
- Всередині бульбашки повідомлення, якщо є `replyToSender`, рендериться цитата з вертикальною акцентною лінією.

Створіть файл `components/SwipeableMessageItem.tsx`:

```tsx
// components/SwipeableMessageItem.tsx
import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";
import { Id } from "@/convex/_generated/dataModel";

export interface MessageItemData {
  _id: Id<"messages">;
  senderId: Id<"users">;
  senderName: string;
  senderPhoto?: string;
  content?: string;
  imageUrl?: string;
  isEdited?: boolean;
  replyToId?: Id<"messages">;
  replyToSender?: string;
  replyToText?: string;
  _creationTime: number;
}

interface SwipeableMessageItemProps {
  item: MessageItemData;
  isOwn: boolean;
  onLongPress: () => void;
  onReply: (message: MessageItemData) => void;
  onImagePress?: (url: string) => void;
  onAuthorPress?: (userId: Id<"users">) => void;
}

const SWIPE_THRESHOLD = 50;

export const SwipeableMessageItem: React.FC<SwipeableMessageItemProps> = ({
  item,
  isOwn,
  onLongPress,
  onReply,
  onImagePress,
  onAuthorPress,
}) => {
  const translateX = useSharedValue(0);

  const triggerReply = () => {
    onReply(item);
  };

  // Жест свайпу вправо для відповіді
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      // Дозволяємо тягнути тільки вправо (від 0 до 80)
      if (event.translationX > 0) {
        translateX.value = Math.min(event.translationX, 80);
      }
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        runOnJS(triggerReply)();
      }
      translateX.value = withSpring(0, { damping: 16, stiffness: 200 });
    });

  const animatedBubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedIconStyle = useAnimatedStyle(() => {
    const progress = Math.min(translateX.value / SWIPE_THRESHOLD, 1);
    return {
      opacity: progress,
      transform: [{ scale: 0.5 + progress * 0.5 }],
    };
  });

  return (
    <View className="relative justify-center my-1">
      {/* Прихована іконка відповіді зліва */}
      <Animated.View
        style={animatedIconStyle}
        className="absolute left-2 z-0 items-center justify-center w-8 h-8 rounded-full bg-primary/30"
      >
        <Ionicons name="arrow-undo" size={18} color={COLORS.primary} />
      </Animated.View>

      {/* Сама бульбашка повідомлення із підтримкою жесту */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={animatedBubbleStyle}
          className={`flex-row ${isOwn ? "justify-end" : "justify-start"}`}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={onLongPress}
            className={`max-w-[82%] rounded-2xl p-3 ${
              isOwn ? "bg-primary rounded-br-xs" : "bg-secondary rounded-bl-xs"
            }`}
          >
            {/* Автор повідомлення (клікабельний для переходу в профіль) */}
            {!isOwn && (
              <TouchableOpacity
                onPress={() => onAuthorPress?.(item.senderId)}
                activeOpacity={0.7}
                className="mb-1"
              >
                <Text className="text-primary font-bold text-xs">{item.senderName}</Text>
              </TouchableOpacity>
            )}

            {/* Блок цитованого повідомлення (Reply Box) */}
            {item.replyToSender && (
              <View className="mb-2 p-2 rounded-lg bg-surface/50 border-l-2 border-primary">
                <Text className="text-primary font-semibold text-[11px]">
                  {item.replyToSender}
                </Text>
                <Text className="text-white/70 text-xs mt-0.5" numberOfLines={2}>
                  {item.replyToText || "📷 Фотографія"}
                </Text>
              </View>
            )}

            {/* Фотографія (якщо прикріплена) */}
            {item.imageUrl && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => onImagePress?.(item.imageUrl!)}
              >
                <Image
                  source={{ uri: item.imageUrl }}
                  className="w-56 h-56 rounded-xl mb-1.5 bg-surface"
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}

            {/* Текст повідомлення */}
            {item.content ? (
              <Text className="text-white text-base leading-5">{item.content}</Text>
            ) : null}

            {/* Час та статус редагування */}
            <View className="flex-row items-center justify-end mt-1 gap-1">
              {item.isEdited && (
                <Text className="text-white/60 text-[10px] italic">(ред.)</Text>
              )}
              <Text className="text-white/60 text-[10px]">
                {new Date(item._creationTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};
```

---

## Крок 5: Інтеграція відповідей у екран чату `app/chat/[id].tsx`

Оновимо `app/chat/[id].tsx`:
1. Додамо стан `replyTarget: ReplyTarget | null`.
2. Додамо пункт «Відповісти» у діалог дій за довгим натисканням (доступний для будь-яких повідомлень, а не лише для власних!).
3. Передамо дані `replyTo` у виклики `sendMessage` та `sendMediaMessage`.
4. Рендеримо компонент `<ReplyPreviewBar />` над блоком введення.

Оновіть файл `app/chat/[id].tsx`:

```tsx
// app/chat/[id].tsx
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { COLORS } from "@/constants/theme";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import { TypingDots } from "@/components/TypingDots";
import { SwipeableMessageItem, MessageItemData } from "@/components/SwipeableMessageItem";
import { ReplyPreviewBar, ReplyTarget } from "@/components/ReplyPreviewBar";

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const chatRoomId = id as Id<"chatRooms">;
  const room = useQuery(api.rooms.getRoom, { roomId: chatRoomId });
  const messages = useQuery(api.messages.listMessages, { chatRoomId });
  const currentUser = useQuery(api.users.currentUser);
  const typingUsers = useQuery(api.typing.getTypingUsers, { chatRoomId });

  const sendMessage = useMutation(api.messages.sendMessage);
  const sendMediaMessage = useMutation(api.messages.sendMediaMessage);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const editMessage = useMutation(api.messages.editMessage);
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const setTyping = useMutation(api.typing.setTyping);

  const [inputText, setInputText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<Id<"messages"> | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const lastTypingCallRef = useRef<number>(0);

  // Тротлінг індикатора набору тексту
  const handleTextChange = (text: string) => {
    setInputText(text);

    const now = Date.now();
    if (now - lastTypingCallRef.current > 1500) {
      lastTypingCallRef.current = now;
      setTyping({ chatRoomId }).catch(console.error);
    }
  };

  // Вибір фото з галереї
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Дозвіл потрібен", "Надайте доступ до медіатеки для надсилання фотографій.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося вибрати зображення");
    }
  };

  // Початок відповіді на повідомлення
  const handleStartReply = (msg: MessageItemData) => {
    setReplyTarget({
      messageId: msg._id,
      senderName: msg.senderName,
      text: msg.content || (msg.imageUrl ? "📷 Фотографія" : ""),
    });
    // Скасовуємо режим редагування, якщо він був відкритий
    setEditingMessageId(null);
  };

  // Відправка повідомлення або збереження змін
  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && !selectedImageUri) || isSubmitting) return;

    try {
      setIsSubmitting(true);

      if (editingMessageId) {
        // Режим збереження редагування
        await editMessage({
          messageId: editingMessageId,
          content: text,
        });
        setEditingMessageId(null);
      } else if (selectedImageUri) {
        // Відправка фотографії у Convex Storage через expo-file-system та expo/fetch
        const uploadUrl = await generateUploadUrl();
        const file = new File(selectedImageUri);

        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: file,
        });

        if (!uploadResult.ok) throw new Error("Не вдалося завантажити зображення");

        const { storageId } = await uploadResult.json();

        await sendMediaMessage({
          chatRoomId,
          storageId,
          caption: text || undefined,
          replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
          replyToSender: replyTarget?.senderName,
          replyToText: replyTarget?.text,
        });

        setSelectedImageUri(null);
        setReplyTarget(null);
      } else {
        // Відправка звичайного тексту з відповіддю (якщо задано)
        await sendMessage({
          chatRoomId,
          content: text,
          replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
          replyToSender: replyTarget?.senderName,
          replyToText: replyTarget?.text,
        });

        setReplyTarget(null);
      }

      setInputText("");
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося надіслати повідомлення");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Контекстне меню дій з повідомленням
  const handleMessageLongPress = (item: MessageItemData) => {
    const isOwn = item.senderId === currentUser?._id;

    const options: any[] = [
      {
        text: "Відповісти",
        onPress: () => handleStartReply(item),
      },
    ];

    if (isOwn) {
      if (item.content) {
        options.push({
          text: "Редагувати",
          onPress: () => {
            setEditingMessageId(item._id);
            setInputText(item.content || "");
            setReplyTarget(null);
          },
        });
      }

      options.push({
        text: "Видалити",
        style: "destructive",
        onPress: () => {
          Alert.alert("Видалити повідомлення?", "Ви впевнені, що хочете видалити повідомлення?", [
            { text: "Скасувати", style: "cancel" },
            {
              text: "Так, видалити",
              style: "destructive",
              onPress: () => deleteMessage({ messageId: item._id }),
            },
          ]);
        },
      });
    }

    options.push({ text: "Скасувати", style: "cancel" });

    Alert.alert("Дії з повідомленням", undefined, options);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: room?.title ?? "Чат",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/settings/${chatRoomId}`)}
              className="p-1"
            >
              <Ionicons name="information-circle-outline" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Список повідомлень */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <SwipeableMessageItem
            item={item as MessageItemData}
            isOwn={item.senderId === currentUser?._id}
            onLongPress={() => handleMessageLongPress(item as MessageItemData)}
            onReply={handleStartReply}
            onImagePress={(url) => setFullscreenImage(url)}
            onAuthorPress={(authorId) => router.push(`/user/${authorId}`)}
          />
        )}
      />

      {/* Індикатор набору тексту іншими учасниками */}
      {typingUsers && typingUsers.length > 0 && <TypingDots typingUsers={typingUsers} />}

      {/* Панель активного цитування (Reply Bar) */}
      {replyTarget && (
        <ReplyPreviewBar
          replyTarget={replyTarget}
          onCancel={() => setReplyTarget(null)}
        />
      )}

      {/* Панель активного редагування власного повідомлення */}
      {editingMessageId && (
        <View className="flex-row items-center justify-between px-4 py-2 bg-surfaceLight border-t border-surface">
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons name="pencil" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text className="text-white text-xs font-semibold">Редагування повідомлення</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setEditingMessageId(null);
              setInputText("");
            }}
          >
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Прев'ю обраної картинки перед відправкою */}
      {selectedImageUri && (
        <View className="flex-row items-center px-4 py-2 bg-surfaceLight border-t border-surface">
          <Image source={{ uri: selectedImageUri }} className="w-12 h-12 rounded-lg mr-3" />
          <Text className="text-white text-xs flex-1">Фото прикріплено</Text>
          <TouchableOpacity onPress={() => setSelectedImageUri(null)}>
            <Ionicons name="close-circle" size={22} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Панель введення тексту */}
      <View className="flex-row items-center p-3 bg-surface border-t border-surfaceLight">
        <TouchableOpacity
          onPress={pickImage}
          disabled={isSubmitting}
          className="mr-2 p-2 rounded-full bg-surfaceLight"
        >
          <Ionicons name="image-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>

        <TextInput
          className="flex-1 bg-background text-white px-4 py-2.5 rounded-full text-base border border-surfaceLight mr-2"
          placeholder={
            editingMessageId
              ? "Змініть текст..."
              : replyTarget
              ? `Відповідь для ${replyTarget.senderName}...`
              : selectedImageUri
              ? "Додайте підпис до фото..."
              : "Напишіть повідомлення..."
          }
          placeholderTextColor={COLORS.textMuted}
          value={inputText}
          onChangeText={handleTextChange}
          multiline
        />

        <TouchableOpacity
          onPress={handleSend}
          disabled={(!inputText.trim() && !selectedImageUri) || isSubmitting}
          className={`w-11 h-11 rounded-full items-center justify-center bg-primary ${
            (!inputText.trim() && !selectedImageUri) || isSubmitting
              ? "opacity-50"
              : "active:opacity-80"
          }`}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons
              name={editingMessageId ? "checkmark" : "send"}
              size={20}
              color="#FFFFFF"
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Модальне вікно перегляду зображення */}
      <ImageViewerModal
        visible={!!fullscreenImage}
        imageUrl={fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />
    </KeyboardAvoidingView>
  );
}
```

---

## Вітаємо! 🎉

Ви додали один із найбільш використовуваних механізмів сучасних месенджерів:
1. Плавний свайп повідомлення праворуч для швидкої відповіді за допомогою **Gesture Handler** та **Reanimated**.
2. Зручну плаваючу панель цитування над інпутом із кнопкою швидкого скасування.
3. Стильний блок цитати всередині надісланого повідомлення в режимі реального часу!
