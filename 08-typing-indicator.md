# Інструкція 8: Індикатор набору тексту (Typing Indicator)

У цій інструкції ми реалізуємо функціонал індикатора набору тексту в реальному часі ("User is typing..."). Коли один із користувачів у чаті починає друкувати, всі інші учасники кімнати бачать сповіщення про це в реальному часі.

---

## Зміст

1. [Крок 1: Додавання таблиці typingIndicators у convex/schema.ts](#крок-1-додавання-таблиці-typingindicators-у-convexschemats)
2. [Крок 2: Серверні функції у convex/typing.ts](#крок-2-серверні-функції-у-convextypingts)
3. [Крок 3: Створення анімованого компонента TypingDots.tsx](#крок-3-створення-анімованого-компонента-typingdotstsx)
4. [Крок 4: Інтеграція індикатора у екран чату app/chat/[id].tsx](#крок-4-інтеграція-індикатора-у-екран-чату-appchatidtsx)
5. [Повний оновлений лістинг app/chat/[id].tsx](#повний-оновлений-лістинг-appchatidtsx)

---

## Крок 1: Додавання таблиці `typingIndicators` у `convex/schema.ts`

Для відстеження стану набору тексту додамо окрему таблицю `typingIndicators`. У ній зберігається час останнього натискання клавіші користувачем.

Відкрийте файл `convex/schema.ts` та додайте опис таблиці:

```typescript
// convex/schema.ts (додати в defineSchema)
  typingIndicators: defineTable({
    chatRoomId: v.id("chatRooms"),
    userId: v.id("users"),
    userName: v.string(),
    lastTypedAt: v.number(),
  })
    .index("by_room", ["chatRoomId"])
    .index("by_user_and_room", ["userId", "chatRoomId"]),
```

---

## Крок 2: Серверні функції у `convex/typing.ts`

Створимо файл `convex/typing.ts` з двома функціями:
1. `setTyping`: мутація, яка фіксує поточний час введення тексту користувачем у кімнаті.
2. `getTypingUsers`: реактивний запит, який повертає список імен користувачів (окрім поточного), які друкували протягом останніх 3 секунд.

Створіть файл `convex/typing.ts`:

```typescript
// convex/typing.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const TYPING_TIMEOUT_MS = 3000; // 3 секунди тайм-аут

/**
 * Оновлює мітку часу набору тексту для поточного користувача
 */
export const setTyping = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const user = await ctx.db.get(userId);
    if (!user) return;

    // Шукаємо існуючий запис користувача для цієї кімнати
    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", userId).eq("chatRoomId", args.chatRoomId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { lastTypedAt: now });
    } else {
      await ctx.db.insert("typingIndicators", {
        chatRoomId: args.chatRoomId,
        userId,
        userName: user.name ?? user.email ?? "Співрозмовник",
        lastTypedAt: now,
      });
    }
  },
});

/**
 * Отримує імена користувачів, які зараз друкують у кімнаті
 */
export const getTypingUsers = query({
  args: {
    chatRoomId: v.id("chatRooms"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const threshold = Date.now() - TYPING_TIMEOUT_MS;

    const indicators = await ctx.db
      .query("typingIndicators")
      .withIndex("by_room", (q) => q.eq("chatRoomId", args.chatRoomId))
      .filter((q) => q.gt(q.field("lastTypedAt"), threshold))
      .collect();

    // Повертаємо імена всіх, хто друкує, крім себе самого
    return indicators
      .filter((ind) => ind.userId !== userId)
      .map((ind) => ind.userName);
  },
});
```

---

## Крок 3: Створення анімованого компонента `TypingDots.tsx`

Створимо плавний компонент трьох пульсуючих крапочок для відображення стану набору.

Створіть файл `components/TypingDots.tsx`:

```tsx
// components/TypingDots.tsx
import { View, Text, Animated } from "react-native";
import { useEffect, useRef } from "react";
import { COLORS } from "@/constants/theme";

type Props = {
  typingUsers: string[];
};

export function TypingDots({ typingUsers }: Props) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(dot, {
            toValue: -4,
            duration: 300,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = animateDot(dot1, 0);
    const anim2 = animateDot(dot2, 150);
    const anim3 = animateDot(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, []);

  if (typingUsers.length === 0) return null;

  const text =
    typingUsers.length === 1
      ? `${typingUsers[0]} друкує`
      : `${typingUsers.join(", ")} друкують`;

  return (
    <View className="flex-row items-center px-4 py-1.5 bg-background">
      <Text className="text-textMuted text-xs mr-2">{text}</Text>
      <View className="flex-row items-center gap-1">
        <Animated.View
          className="w-1.5 h-1.5 rounded-full bg-primary"
          style={{ transform: [{ translateY: dot1 }] }}
        />
        <Animated.View
          className="w-1.5 h-1.5 rounded-full bg-primary"
          style={{ transform: [{ translateY: dot2 }] }}
        />
        <Animated.View
          className="w-1.5 h-1.5 rounded-full bg-primary"
          style={{ transform: [{ translateY: dot3 }] }}
        />
      </View>
    </View>
  );
}
```

---

## Крок 4: Інтеграція індикатора у екран чату `app/chat/[id].tsx`

Тепер підключимо:
1. Виклик мутації `setTyping` при зміні тексту в полі `TextInput`.
2. Щоб не відправляти запит на кожен окремий символ, використовуємо простий тротлінг (запит надсилається не частіше одного разу на 1.5 секунди).
3. Відображення плашки `TypingDots` безпосередньо над полем введення.

Оновлення у файлі `app/chat/[id].tsx`:

```tsx
// 1. Додайте імпорти
import { TypingDots } from "@/components/TypingDots";

// 2. Всередині компонента ChatRoomScreen додайте хуки:
const typingUsers = useQuery(api.typing.getTypingUsers, { chatRoomId });
const setTyping = useMutation(api.typing.setTyping);
const lastTypingSentRef = useRef(0);

// 3. Створіть функцію обробки введення тексту з тротлінгом:
const handleTextChange = (text: string) => {
  setInputText(text);

  const now = Date.now();
  if (now - lastTypingSentRef.current > 1500) {
    lastTypingSentRef.current = now;
    setTyping({ chatRoomId }).catch(() => {});
  }
};

// 4. Замініть onChangeText у TextInput на:
// onChangeText={handleTextChange}

// 5. Одразу над панеллю введення тексту розмістіть блок індикатора:
{typingUsers && typingUsers.length > 0 && (
  <TypingDots typingUsers={typingUsers} />
)}
```

---

## Повний оновлений лістинг `app/chat/[id].tsx`

Ось повна версія компонента `app/chat/[id].tsx`, яка поєднує:
- Редагування та видалення повідомлень (Інструкція 6).
- Відправку та повноекранний перегляд зображень через Convex Storage (Інструкція 7).
- Індикатор набору тексту в реальному часі (Інструкція 8).

```tsx
// app/chat/[id].tsx
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
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";
import { Id } from "@/convex/_generated/dataModel";
import * as ImagePicker from "expo-image-picker";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import { TypingDots } from "@/components/TypingDots";

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatRoomId = id as Id<"chatRooms">;
  const router = useRouter();

  // Дані з Convex
  const room = useQuery(api.rooms.getRoom, { roomId: chatRoomId });
  const messages = useQuery(api.messages.listMessages, { chatRoomId });
  const currentUser = useQuery(api.users.currentUser);
  const typingUsers = useQuery(api.typing.getTypingUsers, { chatRoomId });

  // Мутації
  const sendMessage = useMutation(api.messages.sendMessage);
  const sendMediaMessage = useMutation(api.messages.sendMediaMessage);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const editMessage = useMutation(api.messages.editMessage);
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const setTyping = useMutation(api.typing.setTyping);

  // Локальний стан
  const [inputText, setInputText] = useState("");
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<Id<"messages"> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const lastTypingSentRef = useRef(0);

  // Обробка набору тексту з тротлінгом (1.5 с)
  const handleTextChange = (text: string) => {
    setInputText(text);

    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      setTyping({ chatRoomId }).catch(() => {});
    }
  };

  // Вибір фото з медіатеки
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0].uri) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  // Відправка повідомлення або збереження редагування
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
        // Режим завантаження фото в Convex Storage
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(selectedImageUri);
        const blob = await response.blob();

        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": blob.type || "image/jpeg" },
          body: blob,
        });

        const { storageId } = await uploadResult.json();

        await sendMediaMessage({
          chatRoomId,
          storageId,
          content: text || undefined,
        });

        setSelectedImageUri(null);
      } else {
        // Звичайна відправка тексту
        await sendMessage({
          chatRoomId,
          content: text,
        });
      }

      setInputText("");
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося надіслати повідомлення");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Меню дій над повідомленням (тільки для власних)
  const handleMessageLongPress = (item: {
    _id: Id<"messages">;
    senderId: Id<"users">;
    content?: string;
  }) => {
    if (item.senderId !== currentUser?._id) return;

    const options: any[] = [];

    if (item.content) {
      options.push({
        text: "Редагувати",
        onPress: () => {
          setEditingMessageId(item._id);
          setInputText(item.content || "");
        },
      });
    }

    options.push({
      text: "Видалити",
      style: "destructive",
      onPress: () => {
        Alert.alert("Видалити повідомлення", "Ви впевнені, що хочете видалити повідомлення?", [
          { text: "Скасувати", style: "cancel" },
          {
            text: "Так, видалити",
            style: "destructive",
            onPress: () => deleteMessage({ messageId: item._id }),
          },
        ]);
      },
    });

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
        contentContainerStyle={{ padding: 16, gap: 12 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isOwn = item.senderId === currentUser?._id;

          return (
            <TouchableOpacity
              activeOpacity={0.9}
              onLongPress={() => handleMessageLongPress(item)}
              className={`flex-row ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <View
                className={`max-w-[80%] rounded-2xl p-3 ${
                  isOwn ? "bg-primary rounded-br-xs" : "bg-secondary rounded-bl-xs"
                }`}
              >
                {!isOwn && (
                  <Text className="text-textMuted text-xs font-semibold mb-1">
                    {item.senderName}
                  </Text>
                )}

                {/* Фотографія (якщо надіслана) */}
                {item.imageUrl && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setFullscreenImage(item.imageUrl!)}
                  >
                    <Image
                      source={{ uri: item.imageUrl }}
                      className="w-56 h-56 rounded-xl mb-1 bg-surface"
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}

                {/* Текст повідомлення */}
                {item.content ? (
                  <Text className="text-white text-base leading-5">{item.content}</Text>
                ) : null}

                {/* Час та позначка (ред.) */}
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
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Індикатор набору тексту іншими користувачами */}
      {typingUsers && typingUsers.length > 0 && (
        <TypingDots typingUsers={typingUsers} />
      )}

      {/* Панель активного редагування повідомлення */}
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

      {/* Панель введення */}
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

      {/* Модальне вікно для повноекранного перегляду зображення */}
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

Ви успішно додали розширений інтерактивний функціонал до месенджера **Modern Chat**:
1. Редагування та безпечне видалення повідомлень.
2. Відправку фотографій із галереї через хмарне сховище Convex Storage.
3. Живий індикатор набору тексту з тротлінгом та плавними анімованими крапками.
