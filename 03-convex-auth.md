# Інструкція 3: Автентифікація через Convex Auth

Покрокова інструкція з інтеграції автентифікації (Email та пароль) за допомогою бібліотеки **Convex Auth** (`@convex-dev/auth`) зі збереженням сесії через `expo-secure-store`.

---

## Крок 1: Встановлення необхідних бібліотек

Встановіть пакети авторизації:

```bash
npm install @convex-dev/auth @auth/core@0.41.1
npx expo install expo-secure-store
```

- `@convex-dev/auth` — бібліотека автентифікації для Convex.
- `@auth/core` — ядро Auth.js (потрібне для Convex Auth).
- `expo-secure-store` — безпечне збереження сесійних токенів на пристрої.

---

## Крок 2: Серверні файли авторизації (Convex)

### 2.1 Створіть `convex/auth.ts`

```typescript
// convex/auth.ts
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

### 2.2 Створіть `convex/auth.config.ts`

```typescript
// convex/auth.config.ts
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

### 2.3 Створіть `convex/http.ts`

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

---

## Крок 3: Налаштування клієнта (Expo)

### 3.1 Оновіть кореневий макет `app/_layout.tsx`

Підключимо `ConvexAuthProvider` з безпечним сховищем `SecureStore`:

```tsx
// app/_layout.tsx
import "../global.css";

import InitialLayout from "@/components/InitialLayout";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConvexAuthProvider
        client={convex}
        storage={
          Platform.OS === "android" || Platform.OS === "ios"
            ? secureStorage
            : undefined
        }
      >
        <InitialLayout />
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
```

### 3.2 Створіть `components/InitialLayout.tsx`

Компонент перевіряє статус автентифікації та автоматично перенаправляє користувача:

```tsx
// components/InitialLayout.tsx
import { useEffect } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import * as SplashScreen from "expo-splash-screen";
import { Stack, useRouter, useSegments } from "expo-router";

export default function InitialLayout() {
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

### 3.3 Створіть макет `app/(auth)/_layout.tsx`

```tsx
// app/(auth)/_layout.tsx
import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

### 3.4 Створіть екран авторизації `app/(auth)/login.tsx`

Стилізуємо форму входу та реєстрації за допомогою **Tailwind CSS**:

```tsx
// app/(auth)/login.tsx
import {
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { COLORS } from "@/constants/theme";

export default function LoginScreen() {
  const { signIn } = useAuthActions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Помилка", "Будь ласка, заповніть усі поля.");
      return;
    }

    if (isSignUp && !name.trim()) {
      Alert.alert("Помилка", "Будь ласка, вкажіть ваше ім'я.");
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        await signIn("password", {
          email: email.trim(),
          password: password.trim(),
          name: name.trim(),
          flow: "signUp",
        });
        Alert.alert("Успіх", "Акаунт створено!");
      } else {
        await signIn("password", {
          email: email.trim(),
          password: password.trim(),
          flow: "signIn",
        });
      }
    } catch (err) {
      console.error("Auth Error", err);
      Alert.alert(
        "Помилка",
        isSignUp
          ? "Не вдалося зареєструватися. Можливо, пошта вже зайнята."
          : "Неправильний email або пароль.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-surface"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Логотип додатку */}
        <View className="items-center mt-20">
          <View className="w-20 h-20 rounded-3xl bg-primary/20 items-center justify-center border border-primary/30">
            <Ionicons name="chatbubbles" size={38} color={COLORS.primary} />
          </View>
          <Text className="text-3xl font-bold text-white mt-5 tracking-tight">
            Modern Chat
          </Text>
          <Text className="text-sm text-textMuted mt-2 text-center px-6">
            {isSignUp
              ? "Створіть акаунт для спілкування в кімнатах"
              : "Увійдіть, щоб продовжити спілкування"}
          </Text>
        </View>

        {/* Форма введення */}
        <View className="px-6 mt-12 w-full items-center gap-4">
          {isSignUp && (
            <View className="flex-row items-center bg-secondary border border-surfaceLight rounded-2xl px-4 w-full max-w-sm">
              <Ionicons
                name="person-outline"
                size={20}
                color={COLORS.textMuted}
                style={{ marginRight: 12 }}
              />
              <TextInput
                className="flex-1 py-3.5 text-base text-white"
                placeholder="Ваше ім'я"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View className="flex-row items-center bg-secondary border border-surfaceLight rounded-2xl px-4 w-full max-w-sm">
            <Ionicons
              name="mail-outline"
              size={20}
              color={COLORS.textMuted}
              style={{ marginRight: 12 }}
            />
            <TextInput
              className="flex-1 py-3.5 text-base text-white"
              placeholder="Email"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View className="flex-row items-center bg-secondary border border-surfaceLight rounded-2xl px-4 w-full max-w-sm">
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={COLORS.textMuted}
              style={{ marginRight: 12 }}
            />
            <TextInput
              className="flex-1 py-3.5 text-base text-white"
              placeholder="Пароль"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {/* Кнопка входу/реєстрації */}
          <TouchableOpacity
            className={`flex-row items-center justify-center bg-primary rounded-2xl py-4 w-full max-w-sm mt-3 active:bg-primaryDark ${
              isLoading ? "opacity-60" : ""
            }`}
            activeOpacity={0.85}
            onPress={handleAuth}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text className="text-white text-base font-bold">
                {isSignUp ? "Зареєструватися" : "Увійти"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Перемикач */}
          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            className="mt-3 py-2"
          >
            <Text className="text-primary text-sm font-medium">
              {isSignUp
                ? "Вже є акаунт? Увійти"
                : "Немає акаунту? Створити новий"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

---

## Наступний крок

Автентифікація налаштована! Переходимо до створення серверної логіки та інтерфейсу чат-кімнат: **[Інструкція 4: Чат-кімнати (Створення, список, видалення)](./04-chat-rooms.md)**.
