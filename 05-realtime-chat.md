# Інструкція 5: Чат у Реальному Часі та Профіль Користувача

Покрокова інструкція з реалізації відправки та миттєвого отримання повідомлень у кімнатах чату через **Convex Queries & Mutations**, а також створення екрана профілю та виходу з акаунту.

---

## Крок 1: Серверні функції для повідомлень (`convex/messages.ts`)

Створимо файл `convex/messages.ts`:

```typescript
// convex/messages.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Отримання списку повідомлень у вказаній кімнаті в хронологічному порядку
 */
export const listMessages = query({
  args: { chatRoomId: v.id("chatRooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.chatRoomId))
      .order("asc")
      .collect();
  },
});

/**
 * Відправка нового повідомлення
 */
export const sendMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    content: v.string(),
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

    // 1. Зберігаємо повідомлення
    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? user.email ?? "Гравець",
      senderPhoto: user.image,
      content: trimmedContent,
    });

    // 2. Оновлюємо останнє повідомлення в кімнаті для швидкого перегляду у списку
    await ctx.db.patch(args.chatRoomId, {
      lastMessage: trimmedContent,
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});
```

---

## Крок 2: Екран чату в реальному часі (`app/chat/[id].tsx`)

Створимо екран чату з підтримкою клавіатури, бульбашками повідомлень та миттєвим оновленням через Convex:

```tsx
// app/chat/[id].tsx
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const roomId = id as Id<"chatRooms">;
  const room = useQuery(api.rooms.getRoom, { roomId });
  const messages = useQuery(api.messages.listMessages, { chatRoomId: roomId });
  const currentUser = useQuery(api.users.currentUser);
  const sendMessage = useMutation(api.messages.sendMessage);

  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Автоматичне прокручування вниз при нових повідомленнях
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages?.length]);

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;

    const text = inputText;
    setInputText("");
    setIsSending(true);

    try {
      await sendMessage({
        chatRoomId: roomId,
        content: text,
      });
    } catch (error) {
      console.error("Error sending message", error);
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (!room) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      className="flex-1 bg-surface"
    >
      <Stack.Screen
        options={{
          title: room.title,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/settings/${roomId}`)}
              className="p-1"
            >
              <Ionicons
                name="information-circle-outline"
                size={24}
                color={COLORS.white}
              />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Список повідомлень */}
      {messages === undefined ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingVertical: 16,
            gap: 12,
          }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={40}
                color={COLORS.textMuted}
              />
              <Text className="text-textMuted text-sm mt-2 text-center">
                Повідомлень ще немає. Напишіть першим!
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = currentUser && item.senderId === currentUser._id;

            return (
              <View
                className={`flex-row items-end gap-2 ${
                  isMe ? "justify-end" : "justify-start"
                }`}
              >
                {!isMe && (
                  <View className="w-7 h-7 rounded-full bg-secondary border border-surfaceLight items-center justify-center mb-1">
                    {item.senderPhoto ? (
                      <Image
                        source={{ uri: item.senderPhoto }}
                        className="w-full h-full rounded-full"
                      />
                    ) : (
                      <Text className="text-textMuted text-xs font-bold">
                        {item.senderName[0]?.toUpperCase() ?? "U"}
                      </Text>
                    )}
                  </View>
                )}

                <View
                  className={`max-w-[78%] px-4 py-2.5 rounded-2xl ${
                    isMe
                      ? "bg-primary rounded-br-none"
                      : "bg-secondary border border-surfaceLight rounded-bl-none"
                  }`}
                >
                  {!isMe && (
                    <Text className="text-primary text-xs font-bold mb-1">
                      {item.senderName}
                    </Text>
                  )}
                  <Text className="text-white text-base leading-5">
                    {item.content}
                  </Text>
                  <Text
                    className={`text-[10px] text-right mt-1 ${
                      isMe ? "text-white/70" : "text-textMuted"
                    }`}
                  >
                    {formatTime(item._creationTime)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Панель введення повідомлення */}
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 10) }}
        className="px-4 py-2 bg-surface border-t border-surfaceLight flex-row items-end gap-2"
      >
        <TextInput
          className="flex-1 bg-secondary border border-surfaceLight rounded-2xl px-4 py-2.5 text-white text-base max-h-28 min-h-[42px]"
          placeholder="Повідомлення..."
          placeholderTextColor={COLORS.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        <TouchableOpacity
          onPress={handleSend}
          disabled={!inputText.trim() || isSending}
          className={`w-11 h-11 rounded-2xl items-center justify-center ${
            inputText.trim() && !isSending ? "bg-primary" : "bg-secondary"
          }`}
          activeOpacity={0.8}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons
              name="send"
              size={18}
              color={inputText.trim() ? "#FFFFFF" : COLORS.textMuted}
            />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
```

---

## Крок 3: Екран профілю та виходу з акаунту (`app/profile.tsx`)

Створимо модальний екран профілю користувача:

```tsx
// app/profile.tsx
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const user = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();

  const handleSignOut = () => {
    Alert.alert("Вихід з акаунта", "Ви дійсно бажаєте вийти з додатку?", [
      { text: "Скасувати", style: "cancel" },
      {
        text: "Вийти",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  if (user === undefined) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface p-6 items-center">
      {/* Аватар */}
      <View className="w-24 h-24 rounded-full bg-secondary border-2 border-primary/40 items-center justify-center mt-6 mb-4">
        {user?.image ? (
          <Image
            source={{ uri: user.image }}
            className="w-full h-full rounded-full"
          />
        ) : (
          <Ionicons name="person" size={44} color={COLORS.primary} />
        )}
      </View>

      {/* Інформація про користувача */}
      <Text className="text-white text-2xl font-bold">
        {user?.name ?? "Користувач"}
      </Text>
      <Text className="text-textMuted text-sm mt-1">{user?.email}</Text>

      {/* Кнопка виходу */}
      <TouchableOpacity
        onPress={handleSignOut}
        className="w-full bg-danger/20 border border-danger/30 rounded-2xl py-4 mt-12 flex-row items-center justify-center active:bg-danger/30"
        activeOpacity={0.8}
      >
        <Ionicons
          name="log-out-outline"
          size={20}
          color={COLORS.danger}
          style={{ marginRight: 8 }}
        />
        <Text className="text-danger text-base font-bold">
          Вийти з акаунту
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

---

## Підсумок виконання домашнього завдання

Ви успішно побудували повноцінний сучасний додаток **Modern Chat**:
1. **Convex Auth**: Надійна та безпечна система автентифікації на основі Email & Password.
2. **Tailwind CSS (NativeWind v4)**: Сучасний темний інтерфейс зі зручною компонентною моделлю.
3. **Чат-кімнати**: Створення, реактивний список та можливість видалення автором.
4. **Миттєвий обмін повідомленнями**: Real-time синхронізація через реактивні запити Convex (`useQuery`) з автоскролом та оптимізованим введенням тексту.
