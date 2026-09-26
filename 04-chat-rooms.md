# Інструкція 4: Чат-кімнати (Створення, Список, Видалення)

Покрокова інструкція зі створення серверних функцій для чат-кімнат у Convex та реалізації клієнтського інтерфейсу (список кімнат, створення нової кімнати та налаштування).

---

## Крок 1: Серверні функції для кімнат (`convex/rooms.ts`)

Створимо файл `convex/rooms.ts` з функціями для отримання списку кімнат, деталей окремої кімнати, створення та видалення кімнати:

```typescript
// convex/rooms.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Отримання списку всіх кімнат
 */
export const listRooms = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("chatRooms").order("desc").collect();
  },
});

/**
 * Отримання інформації про конкретну кімнату
 */
export const getRoom = query({
  args: { roomId: v.id("chatRooms") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.roomId);
  },
});

/**
 * Створення нової кімнати
 */
export const createRoom = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const roomId = await ctx.db.insert("chatRooms", {
      title: args.title.trim(),
      description: args.description?.trim(),
      creatorId: userId,
      lastMessageAt: Date.now(),
    });

    return roomId;
  },
});

/**
 * Видалення кімнати (тільки автором) разом із повідомленнями
 */
export const deleteRoom = mutation({
  args: { roomId: v.id("chatRooms") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found: Кімнату не знайдено");
    }

    if (room.creatorId !== userId) {
      throw new Error("Forbidden: Тільки автор може видалити цю кімнату");
    }

    // Видаляємо всі повідомлення, що належали цій кімнаті
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.roomId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    // Видаляємо саму кімнату
    await ctx.db.delete(args.roomId);
  },
});
```

---

## Крок 2: Налаштування навігаційного макета `app/(app)/_layout.tsx`

Створимо макет для авторизованої частини додатку:

```tsx
// app/(app)/_layout.tsx
import { Stack } from "expo-router";
import { COLORS } from "@/constants/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: "bold" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.surface },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Чат-кімнати",
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="new-room"
        options={{
          presentation: "modal",
          title: "Нова кімната",
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          presentation: "modal",
          title: "Профіль",
        }}
      />
      <Stack.Screen
        name="chat/[id]"
        options={{
          title: "Чат",
          headerBackTitle: "Назад",
        }}
      />
      <Stack.Screen
        name="settings/[id]"
        options={{
          presentation: "modal",
          title: "Інформація про кімнату",
        }}
      />
    </Stack>
  );
}
```

---

## Крок 3: Головний екран зі списком кімнат (`app/(app)/index.tsx`)

Реалізуємо реактивний список кімнат через `useQuery(api.rooms.listRooms)`:

```tsx
// app/(app)/index.tsx
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { COLORS } from "@/constants/theme";

export default function HomeScreen() {
  const router = useRouter();
  const rooms = useQuery(api.rooms.listRooms);
  const user = useQuery(api.users.currentUser);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <View className="flex-1 bg-surface">
      <Stack.Screen
        options={{
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.push("/profile")}
              className="mr-3 w-9 h-9 rounded-full bg-secondary border border-surfaceLight items-center justify-center"
              activeOpacity={0.8}
            >
              <Ionicons name="person" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/new-room")}
              className="w-9 h-9 rounded-full bg-primary items-center justify-center"
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ),
        }}
      />

      {rooms === undefined ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : rooms.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <View className="w-16 h-16 rounded-3xl bg-secondary items-center justify-center mb-4">
            <Ionicons name="chatbubbles-outline" size={32} color={COLORS.textMuted} />
          </View>
          <Text className="text-white text-lg font-bold text-center">
            Немає активних кімнат
          </Text>
          <Text className="text-textMuted text-sm text-center mt-1">
            Створіть першу кімнату за допомогою кнопки «+» угорі
          </Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/chat/${item._id}`)}
              className="bg-secondary border border-surfaceLight rounded-2xl p-4 flex-row items-center justify-between active:opacity-80"
              activeOpacity={0.8}
            >
              <View className="flex-1 mr-3">
                <Text className="text-white text-base font-bold" numberOfLines={1}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text className="text-textMuted text-sm mt-0.5" numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
                {item.lastMessage ? (
                  <Text className="text-primary text-xs mt-1.5" numberOfLines={1}>
                    Останнє: {item.lastMessage}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
```

---

## Крок 4: Модальне вікно створення кімнати (`app/new-room.tsx`)

```tsx
// app/new-room.tsx
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useRouter, Stack } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { COLORS } from "@/constants/theme";

export default function NewRoomScreen() {
  const router = useRouter();
  const createRoom = useMutation(api.rooms.createRoom);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Помилка", "Будь ласка, введіть назву кімнати.");
      return;
    }

    setIsLoading(true);
    try {
      const roomId = await createRoom({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      router.back();
      router.push(`/chat/${roomId}`);
    } catch (error) {
      console.error("Error creating room", error);
      Alert.alert("Помилка", "Не вдалося створити кімнату.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-surface p-6">
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={handleCreate}
              disabled={isLoading || !title.trim()}
              className={`px-3 py-1.5 rounded-xl bg-primary ${
                isLoading || !title.trim() ? "opacity-50" : ""
              }`}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white text-sm font-bold">Створити</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />

      <View className="gap-4 mt-2">
        <View>
          <Text className="text-textMuted text-xs font-semibold uppercase mb-2">
            Назва кімнати *
          </Text>
          <TextInput
            className="bg-secondary border border-surfaceLight rounded-2xl px-4 py-3.5 text-white text-base"
            placeholder="Наприклад: Обговорення React Native"
            placeholderTextColor={COLORS.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            autoFocus
          />
        </View>

        <View>
          <Text className="text-textMuted text-xs font-semibold uppercase mb-2">
            Опис (необов'язково)
          </Text>
          <TextInput
            className="bg-secondary border border-surfaceLight rounded-2xl px-4 py-3.5 text-white text-base min-h-[100px]"
            placeholder="Короткий опис теми спілкування..."
            placeholderTextColor={COLORS.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            maxLength={300}
            textAlignVertical="top"
          />
        </View>
      </View>
    </View>
  );
}
```

---

## Крок 5: Налаштування кімнати та видалення (`app/settings/[id].tsx`)

```tsx
// app/settings/[id].tsx
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

export default function RoomSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const room = useQuery(api.rooms.getRoom, {
    roomId: id as Id<"chatRooms">,
  });
  const currentUser = useQuery(api.users.currentUser);
  const deleteRoom = useMutation(api.rooms.deleteRoom);

  const isCreator = room && currentUser && room.creatorId === currentUser._id;

  const handleDelete = () => {
    Alert.alert(
      "Видалення кімнати",
      "Ви впевнені, що хочете видалити цю кімнату та всі її повідомлення?",
      [
        { text: "Скасувати", style: "cancel" },
        {
          text: "Видалити",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRoom({ roomId: id as Id<"chatRooms"> });
              router.dismissAll();
              router.replace("/(app)");
            } catch (err) {
              console.error(err);
              Alert.alert("Помилка", "Не вдалося видалити кімнату.");
            }
          },
        },
      ]
    );
  };

  if (!room) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface p-6">
      <View className="bg-secondary border border-surfaceLight rounded-2xl p-5 mb-6">
        <Text className="text-textMuted text-xs font-semibold uppercase mb-1">
          Назва
        </Text>
        <Text className="text-white text-xl font-bold">{room.title}</Text>

        {room.description ? (
          <>
            <Text className="text-textMuted text-xs font-semibold uppercase mt-4 mb-1">
              Опис
            </Text>
            <Text className="text-neutral-300 text-sm">{room.description}</Text>
          </>
        ) : null}
      </View>

      {isCreator && (
        <TouchableOpacity
          onPress={handleDelete}
          className="bg-danger/20 border border-danger/30 rounded-2xl py-4 flex-row items-center justify-center active:bg-danger/30"
          activeOpacity={0.8}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color={COLORS.danger}
            style={{ marginRight: 8 }}
          />
          <Text className="text-danger text-base font-bold">
            Видалити кімнату
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

---

## Наступний крок

Ми реалізували список і управління кімнатами. Переходимо до найважливішої частини — відправки та миттєвого відображення повідомлень: **[Інструкція 5: Чат у реальному часі та Профіль](./05-realtime-chat.md)**.
