# Інструкція 9: Видалення та керування кімнатами свайпом (Swipeable Room Item)

У цій інструкції ми додамо до нашого додатку **Modern Chat** підтримку інтерактивних мобільних жестів (Gestures & Physics Animations). Ми реалізуємо свайп карточки чат-кімнати вліво у списку чатів (`Swipe to Delete / Leave`) за допомогою сучасного стеку **React Native Gesture Handler** та **React Native Reanimated 3**, стилізованого через **Tailwind CSS (NativeWind v4)**.

---

## Зміст

1. [Крок 1: Перевірка та встановлення бібліотек](#крок-1-перевірка-та-встановлення-бібліотек)
2. [Крок 2: Оновлення серверних функцій для кімнат у convex/rooms.ts](#крок-2-оновлення-серверних-функцій-для-кімнат-у-convexroomsts)
3. [Крок 3: Створення компонента SwipeableRoomItem.tsx](#крок-3-створення-компонента-swipeableroomitemtsx)
4. [Крок 4: Інтеграція свайп-елементів у головний екран app/(app)/index.tsx](#крок-4-інтеграція-свайп-елементів-у-головний-екран-appappindextsx)
5. [Повний лістинг components/SwipeableRoomItem.tsx](#повний-лістинг-componentsswipeableroomitemtsx)
6. [Повний лістинг app/(app)/index.tsx](#повний-лістинг-appappindextsx)

---

## Крок 1: Перевірка та встановлення бібліотек

Для плавної роботи жестів на 60–120 FPS без блокування основного JS-потоку ми використовуємо бібліотеки `react-native-gesture-handler` та `react-native-reanimated`.

Переконайтеся, що вони встановлені у вашому проєкті:

```bash
npx expo install react-native-gesture-handler react-native-reanimated
```

> [!IMPORTANT]
> Переконайтеся, що у кореневому файлі `app/_layout.tsx` увесь додаток загорнуто у `<GestureHandlerRootView style={{ flex: 1 }}>`, а у `babel.config.js` підключено плагін `'react-native-reanimated/plugin'` (в самому кінці масиву `plugins`).

---

## Крок 2: Оновлення серверних функцій для кімнат у `convex/rooms.ts`

Перевіримо функцію `deleteRoom` у файлі `convex/rooms.ts`. Творець кімнати має право безповоротно видалити кімнату разом із усіма її повідомленнями та індикаторами набору тексту. Якщо користувач не є творцем, сервер повертає чітке повідомлення про помилку.

Відкрийте файл `convex/rooms.ts` та переконайтеся, що мутація `deleteRoom` реалізована наступним чином:

```typescript
// convex/rooms.ts

/**
 * Видалення кімнати (доступно лише творцю кімнати)
 */
export const deleteRoom = mutation({
  args: {
    roomId: v.id("chatRooms"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Кімнату не знайдено");
    }

    // Перевірка прав: тільки творець може видалити кімнату
    if (room.creatorId !== userId) {
      throw new Error("Forbidden: Видалити кімнату може лише її творець");
    }

    // 1. Видаляємо всі повідомлення кімнати
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.roomId))
      .collect();

    for (const msg of messages) {
      // Якщо до повідомлення прикріплено файл у сховищі — видаляємо його
      if (msg.storageId) {
        await ctx.storage.delete(msg.storageId);
      }
      await ctx.db.delete(msg._id);
    }

    // 2. Видаляємо індикатори набору тексту для цієї кімнати
    const typingRecords = await ctx.db
      .query("typingIndicators")
      .withIndex("by_room", (q) => q.eq("chatRoomId", args.roomId))
      .collect();

    for (const record of typingRecords) {
      await ctx.db.delete(record._id);
    }

    // 3. Видаляємо саму кімнату
    await ctx.db.delete(args.roomId);

    return { success: true };
  },
});
```

---

## Крок 3: Створення компонента `SwipeableRoomItem.tsx`

Створимо компонент `components/SwipeableRoomItem.tsx`.

### Принцип роботи жесту:
1. **Нижній шар (Underlay):** Розміщується позаду картки, пофарбований у червоний колір (`bg-red-500` / `bg-danger`) і містить іконку смітника `trash-outline` та підпис "Видалити".
2. **Верхній шар (Card):** Сама картка чату. За допомогою `Gesture.Pan()` ми слухаємо горизонтальне переміщення пальця:
   - Якщо користувач тягне картку вліво (`translationX < 0`), змінюємо значення `translateX.value`.
   - Задаємо обмеження максимального зсуву (до `-90px`).
   - При завершенні жесту (`onEnd`): якщо зсув перевищив поріг `-50px`, картка за допомогою пружинної анімації `withSpring` фіксується у відкритому положенні (`-80px`), відкриваючи кнопку дії. Якщо поріг не досягнуто — вона повертається у позицію `0`.
   - Додаємо налаштування `activeOffsetX([-10, 10])`, щоб горизонтальний жест не конфліктував із вертикальним скролом `FlatList`.

Створіть файл `components/SwipeableRoomItem.tsx`:

```tsx
// components/SwipeableRoomItem.tsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
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

interface RoomData {
  _id: Id<"chatRooms">;
  title: string;
  description?: string;
  creatorId: Id<"users">;
  lastMessage?: string;
  lastMessageAt?: number;
}

interface SwipeableRoomItemProps {
  room: RoomData;
  isCreator: boolean;
  onPress: () => void;
  onDelete: (roomId: Id<"chatRooms">) => void;
}

const ACTION_WIDTH = 80; // Ширина прихованої кнопки видалення

export const SwipeableRoomItem: React.FC<SwipeableRoomItemProps> = ({
  room,
  isCreator,
  onPress,
  onDelete,
}) => {
  const translateX = useSharedValue(0);

  // Скидання положення картки
  const resetPosition = () => {
    "worklet";
    translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
  };

  const handleDeletePress = () => {
    resetPosition();
    onDelete(room._id);
  };

  // Конфігурація горизонтального жесту Pan
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // Не блокує вертикальний скрол FlatList
    .onUpdate((event) => {
      // Дозволяємо свайп лише вліво (від 0 до -100)
      if (event.translationX <= 0) {
        translateX.value = Math.max(event.translationX, -ACTION_WIDTH - 20);
      } else {
        // Легкий супротив при спробі тягнути вправо
        translateX.value = event.translationX * 0.15;
      }
    })
    .onEnd((event) => {
      if (event.translationX < -ACTION_WIDTH / 2) {
        // Фіксуємо у відкритому стані
        translateX.value = withSpring(-ACTION_WIDTH, { damping: 18, stiffness: 180 });
      } else {
        // Повертаємо назад
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  // Анімований стиль для верхньої картки
  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Анімована прозорість та масштаб іконки смітника
  const animatedIconStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / ACTION_WIDTH, 1);
    return {
      opacity: progress,
      transform: [{ scale: 0.6 + 0.4 * progress }],
    };
  });

  return (
    <View className="relative overflow-hidden rounded-2xl mb-3">
      {/* Нижня фонова панель з кнопкою видалення */}
      <View className="absolute inset-0 bg-red-600 rounded-2xl flex-row justify-end items-center pr-5">
        <TouchableOpacity
          onPress={handleDeletePress}
          activeOpacity={0.8}
          className="items-center justify-center h-full px-2"
        >
          <Animated.View style={animatedIconStyle} className="items-center">
            <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
            <Text className="text-white text-[11px] font-bold mt-1">
              {isCreator ? "Видалити" : "Закрити"}
            </Text>
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Верхня картка кімнати, що рухається */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedCardStyle}>
          <TouchableOpacity
            onPress={() => {
              if (translateX.value !== 0) {
                resetPosition();
              } else {
                onPress();
              }
            }}
            activeOpacity={0.9}
            className="bg-secondary border border-surfaceLight rounded-2xl p-4 flex-row items-center justify-between"
          >
            <View className="flex-row items-center flex-1 mr-3">
              {/* Іконка чат-кімнати */}
              <View className="w-12 h-12 rounded-xl bg-surfaceLight items-center justify-center mr-3.5">
                <Ionicons name="chatbubbles" size={22} color={COLORS.primary} />
              </View>

              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-white text-base font-bold flex-shrink" numberOfLines={1}>
                    {room.title}
                  </Text>
                  {isCreator && (
                    <View className="bg-primary/20 px-1.5 py-0.5 rounded">
                      <Text className="text-primary text-[10px] font-semibold">автор</Text>
                    </View>
                  )}
                </View>

                {room.lastMessage ? (
                  <Text className="text-textMuted text-xs mt-1" numberOfLines={1}>
                    {room.lastMessage}
                  </Text>
                ) : (
                  <Text className="text-textMuted/60 text-xs italic mt-1" numberOfLines={1}>
                    {room.description || "Повідомлень ще немає"}
                  </Text>
                )}
              </View>
            </View>

            {/* Час або стрілочка */}
            <View className="items-end">
              {room.lastMessageAt ? (
                <Text className="text-textMuted text-[10px] mb-1">
                  {new Date(room.lastMessageAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};
```

---

## Крок 4: Інтеграція свайп-елементів у головний екран `app/(app)/index.tsx`

Тепер оновимо екран зі списком чатів:
1. Замінимо звичайний `renderItem` у `FlatList` на наш новий `<SwipeableRoomItem />`.
2. Додамо функцію `handleDeleteRoom`, яка відкриває `Alert.alert` для підтвердження.
3. Якщо поточний користувач є творцем кімнати — викликаємо мутацію `deleteRoom`. Якщо ні — показуємо попередження, що видалити кімнату може тільки її творець.

Оновіть файл `app/(app)/index.tsx`:

```tsx
// app/(app)/index.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";
import { Id } from "@/convex/_generated/dataModel";
import { SwipeableRoomItem } from "@/components/SwipeableRoomItem";

export default function HomeScreen() {
  const router = useRouter();
  const rooms = useQuery(api.rooms.listRooms);
  const currentUser = useQuery(api.users.currentUser);
  const deleteRoom = useMutation(api.rooms.deleteRoom);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  // Обробка видалення кімнати через діалог підтвердження
  const handleDeleteRoom = (roomId: Id<"chatRooms">) => {
    const room = rooms?.find((r) => r._id === roomId);
    if (!room) return;

    const isCreator = room.creatorId === currentUser?._id;

    if (!isCreator) {
      Alert.alert(
        "Обмеження доступу",
        "Лише автор кімнати має право видалити її для всіх учасників.",
        [{ text: "Зрозуміло", style: "default" }]
      );
      return;
    }

    Alert.alert(
      "Видалити кімнату?",
      `Ви впевнені, що хочете видалити кімнату «${room.title}» та всі її повідомлення? Цю дію неможливо скасувати.`,
      [
        { text: "Скасувати", style: "cancel" },
        {
          text: "Видалити",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRoom({ roomId });
            } catch (error: any) {
              Alert.alert("Помилка", error?.message || "Не вдалося видалити кімнату");
            }
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <Stack.Screen
        options={{
          title: "Чат-кімнати",
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
              className="w-9 h-9 rounded-full bg-primary items-center justify-center shadow-sm"
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
          <Text className="text-textMuted text-xs mt-3">Завантаження кімнат...</Text>
        </View>
      ) : rooms.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <View className="w-16 h-16 rounded-3xl bg-secondary border border-surfaceLight items-center justify-center mb-4">
            <Ionicons name="chatbubbles-outline" size={32} color={COLORS.textMuted} />
          </View>
          <Text className="text-white text-lg font-bold text-center">Немає активних кімнат</Text>
          <Text className="text-textMuted text-sm text-center mt-1">
            Створіть першу кімнату за допомогою кнопки «+» угорі
          </Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <SwipeableRoomItem
              room={item}
              isCreator={item.creatorId === currentUser?._id}
              onPress={() => router.push(`/chat/${item._id}`)}
              onDelete={handleDeleteRoom}
            />
          )}
        />
      )}
    </View>
  );
}
```

---

## Вітаємо! 🎉

Ви реалізували плавний свайп для списку чатів із повною інтеграцією **Reanimated 3** та **Gesture Handler**:
1. Користувач може свайпнути будь-яку кімнату вліво.
2. При свайпі відкривається стильна червона кнопка з анімованою іконкою.
3. Творець може зручно та безпечно видалити кімнату через підтвердження діалогу!
