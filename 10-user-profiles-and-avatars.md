# Інструкція 10: Кастомізація власного профілю, аватарка у Convex Storage та екран співрозмовника

У цій інструкції ми перетворимо базовий екран профілю користувача на повноцінний центр керування акаунтом у додатку **Modern Chat**: додамо завантаження власної аватарки у хмару **Convex Storage**, редагування імені, нікнейму (`@username`) та статусу/біографії (`bio`), а також реалізуємо публічний екран перегляду профілю співрозмовника (`app/user/[id].tsx`) при тапі на аватар або ім'я в чаті.

---

## Зміст

1. [Крок 1: Оновлення схеми користувачів у convex/schema.ts](#крок-1-оновлення-схеми-користувачів-у-convexschemats)
2. [Крок 2: Серверні функції профілю у convex/users.ts](#крок-2-серверні-функції-профілю-у-convexusersts)
3. [Крок 3: Створення модального вікна EditProfileModal.tsx](#крок-3-створення-модального-вікна-editprofilemodaltsx)
4. [Крок 4: Оновлення екрана власного профілю app/profile.tsx](#крок-4-оновлення-екрана-власного-профілю-appprofiletsx)
5. [Крок 5: Створення екрана перегляду профілю співрозмовника app/user/[id].tsx](#крок-5-створення-екрана-перегляду-профілю-співрозмовника-appuseridtsx)
6. [Крок 6: Реєстрація нового роуту у app/_layout.tsx](#крок-6-реєстрація-нового-роуту-у-app_layouttsx)
7. [Повний лістинг components/EditProfileModal.tsx](#повний-лістинг-componentseditprofilemodaltsx)
8. [Повний лістинг app/profile.tsx](#повний-лістинг-appprofiletsx)
9. [Повний лістинг app/user/[id].tsx](#повний-лістинг-appuseridtsx)

---

## Крок 1: Оновлення схеми користувачів у `convex/schema.ts`

Додамо до таблиці `users` додаткові поля для кастомізації: `username`, `bio` та `avatarStorageId`.

Відкрийте файл `convex/schema.ts` та оновіть таблицю `users`:

```typescript
// convex/schema.ts
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    username: v.optional(v.string()), // Унікальний нікнейм користувача (@username)
    bio: v.optional(v.string()),      // Статус або короткий опис профілю
    avatarStorageId: v.optional(v.id("_storage")),
  }).index("by_email", ["email"]),
```

---

## Крок 2: Серверні функції профілю у `convex/users.ts`

У файлі `convex/users.ts` створимо функції:
1. `generateAvatarUploadUrl`: генерація посилання для прямого завантаження фотографії аватара у Convex Storage.
2. `updateUserProfile`: мутація для збереження оновленого імені, нікнейму, біографії та посилання на нове фото.
3. `getUserProfile`: запит публічних даних будь-якого користувача за його `userId` із підрахунком корисної статистики (кількість надісланих повідомлень та створених кімнат).

Відкрийте `convex/users.ts` та додайте функції:

```typescript
// convex/users.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Отримання поточного авторизованого користувача
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

/**
 * Генерація одноразового посилання для завантаження аватарки в Convex Storage
 */
export const generateAvatarUploadUrl = mutation(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Unauthorized: Потрібна авторизація");
  }
  return await ctx.storage.generateUploadUrl();
});

/**
 * Оновлення профілю поточного користувача
 */
export const updateUserProfile = mutation({
  args: {
    name: v.string(),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new Error("Ім'я користувача не може бути порожнім");
    }

    const patchData: Record<string, any> = {
      name: trimmedName,
      username: args.username?.trim().replace(/^@/, ""),
      bio: args.bio?.trim(),
    };

    // Якщо завантажено новий аватар, оновлюємо URL та ID сховища
    if (args.avatarStorageId) {
      const imageUrl = await ctx.storage.getUrl(args.avatarStorageId);
      if (imageUrl) {
        patchData.image = imageUrl;
        patchData.avatarStorageId = args.avatarStorageId;
      }
    }

    await ctx.db.patch(userId, patchData);
    return { success: true };
  },
});

/**
 * Отримання публічного профілю користувача за ID зі статистикою активності
 */
export const getUserProfile = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Підрахунок надісланих повідомлень
    const userMessages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("senderId"), args.userId))
      .collect();

    // Підрахунок створених кімнат
    const createdRooms = await ctx.db
      .query("chatRooms")
      .filter((q) => q.eq(q.field("creatorId"), args.userId))
      .collect();

    return {
      _id: user._id,
      name: user.name ?? "Користувач",
      email: user.email,
      image: user.image,
      username: user.username,
      bio: user.bio,
      _creationTime: user._creationTime,
      stats: {
        messagesCount: userMessages.length,
        roomsCreatedCount: createdRooms.length,
      },
    };
  },
});
```

---

## Крок 3: Створення модального вікна `EditProfileModal.tsx`

Створимо компонент `components/EditProfileModal.tsx`. Він дозволяє користувачеві:
- Вибрати нове фото профілю через `expo-image-picker`.
- Ввести нове ім'я, нікнейм (`@username`) та біографію.
- Завантажити аватар у Convex Storage та зберегти оновлення одним кліком.

Створіть файл `components/EditProfileModal.tsx`:

```tsx
// components/EditProfileModal.tsx
import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { COLORS } from "@/constants/theme";

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  currentUser: {
    name?: string;
    username?: string;
    bio?: string;
    image?: string;
  } | null;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  onClose,
  currentUser,
}) => {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateUserProfile = useMutation(api.users.updateUserProfile);
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);

  useEffect(() => {
    if (visible && currentUser) {
      setName(currentUser.name || "");
      setUsername(currentUser.username || "");
      setBio(currentUser.bio || "");
      setAvatarUri(currentUser.image || null);
    }
  }, [visible, currentUser]);

  // Вибір фото з галереї
  const pickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Потрібен доступ", "Дозвольте додатку доступ до галереї для вибору фото.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setAvatarUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося вибрати аватар");
    }
  };

  // Збереження змін
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Помилка", "Ім'я не може бути порожнім");
      return;
    }

    try {
      setIsSubmitting(true);
      let newStorageId = undefined;

      // Якщо вибрано новий локальний файл аватара — завантажуємо через expo-file-system та expo/fetch
      if (avatarUri && avatarUri !== currentUser?.image) {
        const uploadUrl = await generateAvatarUploadUrl();
        const file = new File(avatarUri);

        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: file,
        });

        if (!uploadResult.ok) throw new Error("Не вдалося завантажити фото");

        const { storageId } = await uploadResult.json();
        newStorageId = storageId;
      }

      await updateUserProfile({
        name: name.trim(),
        username: username.trim() || undefined,
        bio: bio.trim() || undefined,
        avatarStorageId: newStorageId,
      });

      Alert.alert("Успіх", "Профіль успішно оновлено!");
      onClose();
    } catch (error: any) {
      console.error(error);
      Alert.alert("Помилка", error?.message || "Не вдалося оновити профіль");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/70"
      >
        <View className="bg-surface rounded-t-3xl border-t border-surfaceLight max-h-[90%] p-6">
          {/* Заголовок модального вікна */}
          <View className="flex-row items-center justify-between pb-4 border-b border-surfaceLight">
            <Text className="text-white text-lg font-bold">Редагувати профіль</Text>
            <TouchableOpacity onPress={onClose} disabled={isSubmitting}>
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="mt-4">
            {/* Вибір фото профілю */}
            <View className="items-center my-4">
              <TouchableOpacity
                onPress={pickAvatar}
                disabled={isSubmitting}
                className="relative"
                activeOpacity={0.8}
              >
                <View className="w-24 h-24 rounded-full bg-secondary border-2 border-primary/50 overflow-hidden items-center justify-center">
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <Ionicons name="person" size={44} color={COLORS.primary} />
                  )}
                </View>
                <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary items-center justify-center border-2 border-surface">
                  <Ionicons name="camera" size={16} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <Text className="text-primary text-xs font-semibold mt-2">Змінити фотографію</Text>
            </View>

            {/* Поле: Ім'я */}
            <View className="mb-4">
              <Text className="text-textMuted text-xs font-semibold uppercase mb-1.5">
                Ім'я користувача *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ваше повне ім'я"
                placeholderTextColor={COLORS.textMuted}
                className="bg-secondary border border-surfaceLight rounded-xl px-4 py-3 text-white text-base"
              />
            </View>

            {/* Поле: Нікнейм */}
            <View className="mb-4">
              <Text className="text-textMuted text-xs font-semibold uppercase mb-1.5">
                Нікнейм (@username)
              </Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="alex_dev"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                className="bg-secondary border border-surfaceLight rounded-xl px-4 py-3 text-white text-base"
              />
            </View>

            {/* Поле: Статус / Bio */}
            <View className="mb-6">
              <Text className="text-textMuted text-xs font-semibold uppercase mb-1.5">
                Про себе (Статус)
              </Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Розробляю чудові додатки на React Native 🚀"
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                className="bg-secondary border border-surfaceLight rounded-xl px-4 py-3 text-white text-base min-h-[80px]"
              />
            </View>

            {/* Кнопка збереження */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSubmitting}
              className="bg-primary rounded-xl py-3.5 items-center justify-center active:opacity-80 mb-6"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white font-bold text-base">Зберегти зміни</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
```

---

## Крок 4: Оновлення екрана власного профілю `app/profile.tsx`

Тепер переробимо `app/profile.tsx`, щоб він відображав:
- Великий аватар із якісною рамкою.
- Ім'я, нікнейм `@username`, email та статус `bio`.
- Картки статистики (кількість відправлених повідомлень та створених кімнат через запит `getUserProfile`).
- Кнопку «Редагувати профіль», яка відкриває `EditProfileModal`.
- Кнопку виходу з акаунту.

Оновіть файл `app/profile.tsx`:

```tsx
// app/profile.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";
import { EditProfileModal } from "@/components/EditProfileModal";

export default function ProfileScreen() {
  const router = useRouter();
  const currentUser = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Завантажуємо розширені дані та статистику
  const profileDetails = useQuery(
    api.users.getUserProfile,
    currentUser?._id ? { userId: currentUser._id } : "skip"
  );

  const handleSignOut = () => {
    Alert.alert("Вихід з акаунта", "Ви дійсно бажаєте вийти з Modern Chat?", [
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

  if (currentUser === undefined || profileDetails === undefined) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20 }}>
      {/* Шапка профілю */}
      <View className="items-center mt-4 mb-6">
        <View className="w-28 h-28 rounded-full bg-secondary border-4 border-primary/40 items-center justify-center overflow-hidden mb-3 shadow-lg">
          {currentUser?.image ? (
            <Image source={{ uri: currentUser.image }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <Ionicons name="person" size={54} color={COLORS.primary} />
          )}
        </View>

        <Text className="text-white text-2xl font-bold">{currentUser?.name ?? "Користувач"}</Text>

        {currentUser?.username && (
          <Text className="text-primary text-sm font-semibold mt-0.5">
            @{currentUser.username}
          </Text>
        )}

        <Text className="text-textMuted text-xs mt-1">{currentUser?.email}</Text>

        {/* Статус / Bio */}
        {currentUser?.bio ? (
          <View className="mt-3 px-4 py-2 bg-secondary rounded-xl border border-surfaceLight max-w-[90%]">
            <Text className="text-white/90 text-sm text-center italic">{currentUser.bio}</Text>
          </View>
        ) : null}
      </View>

      {/* Блок статистики активності */}
      <View className="flex-row gap-3 mb-6">
        <View className="flex-1 bg-secondary border border-surfaceLight rounded-2xl p-4 items-center">
          <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center mb-2">
            <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primary} />
          </View>
          <Text className="text-white text-xl font-bold">
            {profileDetails?.stats.messagesCount ?? 0}
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">Повідомлень</Text>
        </View>

        <View className="flex-1 bg-secondary border border-surfaceLight rounded-2xl p-4 items-center">
          <View className="w-10 h-10 rounded-full bg-purple-500/20 items-center justify-center mb-2">
            <Ionicons name="folder" size={20} color="#A855F7" />
          </View>
          <Text className="text-white text-xl font-bold">
            {profileDetails?.stats.roomsCreatedCount ?? 0}
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">Створено кімнат</Text>
        </View>
      </View>

      {/* Дії з акаунтом */}
      <View className="gap-3">
        <TouchableOpacity
          onPress={() => setIsEditModalOpen(true)}
          className="flex-row items-center justify-center bg-primary rounded-2xl py-3.5 px-4 active:opacity-80"
        >
          <Ionicons name="create-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text className="text-white font-bold text-base">Редагувати профіль</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSignOut}
          className="flex-row items-center justify-center bg-red-600/10 border border-red-500/30 rounded-2xl py-3.5 px-4 active:opacity-80"
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} style={{ marginRight: 8 }} />
          <Text className="text-red-500 font-bold text-base">Вийти з акаунта</Text>
        </TouchableOpacity>
      </View>

      {/* Модальне вікно редагування */}
      <EditProfileModal
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        currentUser={currentUser}
      />
    </ScrollView>
  );
}
```

---

## Крок 5: Створення екрана перегляду профілю співрозмовника `app/user/[id].tsx`

Коли користувач у чаті натискає на автора повідомлення, додаток відкриває сторінку з публічною карткою цього учасника: його аватар, ім'я, нікнейм, біографію, дату реєстрації та активність.

Створіть файл `app/user/[id].tsx`:

```tsx
// app/user/[id].tsx
import React from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const userId = id as Id<"users">;
  const userProfile = useQuery(api.users.getUserProfile, { userId });
  const currentUser = useQuery(api.users.currentUser);

  const isOwnProfile = currentUser?._id === userId;

  if (userProfile === undefined) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (userProfile === null) {
    return (
      <View className="flex-1 bg-surface justify-center items-center p-6">
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
        <Text className="text-white text-lg font-bold mt-3">Користувача не знайдено</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 bg-secondary px-5 py-2.5 rounded-xl border border-surfaceLight"
        >
          <Text className="text-white font-medium">Повернутися</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20 }}>
      <Stack.Screen
        options={{
          title: userProfile.name,
          headerBackTitle: "Назад",
        }}
      />

      {/* Фото та основні дані */}
      <View className="items-center mt-4 mb-6">
        <View className="w-28 h-28 rounded-full bg-secondary border-4 border-primary/40 items-center justify-center overflow-hidden mb-3 shadow-lg">
          {userProfile.image ? (
            <Image source={{ uri: userProfile.image }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <Ionicons name="person" size={54} color={COLORS.primary} />
          )}
        </View>

        <Text className="text-white text-2xl font-bold">{userProfile.name}</Text>

        {userProfile.username && (
          <Text className="text-primary text-sm font-semibold mt-0.5">
            @{userProfile.username}
          </Text>
        )}

        {isOwnProfile && (
          <View className="bg-primary/20 px-2 py-0.5 rounded-full mt-2">
            <Text className="text-primary text-xs font-semibold">Це ваш акаунт</Text>
          </View>
        )}

        {/* Статус / Bio */}
        {userProfile.bio ? (
          <View className="mt-4 px-4 py-3 bg-secondary rounded-2xl border border-surfaceLight w-full">
            <Text className="text-textMuted text-xs font-semibold uppercase mb-1">Статус</Text>
            <Text className="text-white text-sm leading-5">{userProfile.bio}</Text>
          </View>
        ) : null}
      </View>

      {/* Статистика активності учасника */}
      <View className="flex-row gap-3 mb-6">
        <View className="flex-1 bg-secondary border border-surfaceLight rounded-2xl p-4 items-center">
          <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center mb-2">
            <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primary} />
          </View>
          <Text className="text-white text-xl font-bold">
            {userProfile.stats.messagesCount}
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">Повідомлень</Text>
        </View>

        <View className="flex-1 bg-secondary border border-surfaceLight rounded-2xl p-4 items-center">
          <View className="w-10 h-10 rounded-full bg-purple-500/20 items-center justify-center mb-2">
            <Ionicons name="folder" size={20} color="#A855F7" />
          </View>
          <Text className="text-white text-xl font-bold">
            {userProfile.stats.roomsCreatedCount}
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">Створено кімнат</Text>
        </View>
      </View>

      {/* Інформація про реєстрацію */}
      <View className="bg-secondary/60 border border-surfaceLight rounded-2xl p-4 flex-row items-center mb-6">
        <Ionicons name="calendar-outline" size={20} color={COLORS.textMuted} style={{ marginRight: 10 }} />
        <Text className="text-textMuted text-xs">
          Учасник з {new Date(userProfile._creationTime).toLocaleDateString()}
        </Text>
      </View>

      {/* Кнопка повернення до чату */}
      <TouchableOpacity
        onPress={() => router.back()}
        className="bg-secondary border border-surfaceLight rounded-2xl py-3.5 items-center justify-center active:opacity-80"
      >
        <Text className="text-white font-bold text-base">Повернутися до розмови</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
```

---

## Крок 6: Реєстрація нового роуту у `app/(app)/_layout.tsx`

Переконайтеся, що роут `user/[id]` додано до навігаційного стека у файлі `app/(app)/_layout.tsx`:

```tsx
// app/(app)/_layout.tsx
// Додати у Stack:
<Stack.Screen
  name="user/[id]"
  options={{
    title: "Профіль учасника",
    headerBackTitle: "Назад",
  }}
/>
```

---

## Вітаємо! 🎉

Ви завершили побудову персоналізованої екосистеми профілів для **Modern Chat**:
1. Користувачі можуть завантажувати власні фотографії у **Convex Storage**, обираючи їх прямо з галереї телефону.
2. Профіль містить нікнейм, біографію та підраховує статистику активності в реальному часі.
3. Усі учасники чатів можуть знайомитися ближче, переглядаючи публічні картки одне одного в `app/user/[id].tsx`!
