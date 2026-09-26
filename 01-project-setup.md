# Інструкція 1: Налаштування проєкту Modern Chat та Tailwind CSS (NativeWind)

Покрокова інструкція з початкового налаштування React Native проєкту для додатку **Modern Chat** за допомогою **Expo Router** та **Tailwind CSS (NativeWind v4)**.

---

## Крок 1: Створення проєкту

Створіть новий Expo-проєкт із шаблоном TypeScript:

```bash
npx create-expo-app@latest modern-chat
cd modern-chat
```

---

## Крок 2: Встановлення та налаштування Tailwind CSS (NativeWind v4)

### 2.1 Встановлення необхідних пакетів

```bash
npm install nativewind tailwindcss
npx expo install babel-preset-expo
```

### 2.2 Ініціалізація конфігурації Tailwind

```bash
npx tailwindcss init
```

### 2.3 Налаштування `tailwind.config.js`

Відкрийте файл `tailwind.config.js` у корені проєкту та оновіть його вміст:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  // Шляхи до всіх директорій з компонентами та екранами
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#3B82F6", // Акцентний синій для повідомлень
        primaryDark: "#1D4ED8",
        secondary: "#1E293B", // Темний Slate для карток і бульбашок співрозмовника
        surface: "#0F172A", // Глибокий темний фон
        surfaceLight: "#334155", // Межі та розділювачі
        textMuted: "#94A3B8", // Приглушений текст
      },
    },
  },
  plugins: [],
};
```

### 2.4 Налаштування `babel.config.js`

> ⚠️ **Важливо:** Файл конфігурації Babel обов'язково повинен мати розширення `.js` (не `.ts`).

Створіть або оновіть `babel.config.js` у корені проєкту:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

### 2.5 Налаштування `metro.config.js`

Створіть файл `metro.config.js` у корені проєкту:

```javascript
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
```

### 2.6 Створення `global.css`

Створіть файл `global.css` у корені проєкту:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 2.7 Декларація типів TypeScript (`nativewind-env.d.ts`)

Створіть файл `nativewind-env.d.ts` у корені проєкту, щоб TypeScript підтримував властивість `className`:

```typescript
/// <reference types="nativewind/types" />
```

---

## Крок 3: Створення структури папок та файлів

Організуйте структуру проєкту:

```
modern-chat/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   ├── (app)/
│   │   ├── _layout.tsx
│   │   └── index.tsx
│   ├── chat/
│   │   └── [id].tsx
│   ├── settings/
│   │   └── [id].tsx
│   ├── new-room.tsx
│   └── profile.tsx
├── constants/
│   └── theme.ts
├── components/
│   └── InitialLayout.tsx
├── babel.config.js
├── global.css
├── metro.config.js
├── nativewind-env.d.ts
└── tailwind.config.js
```

---

## Крок 4: Створення базових файлів

### 4.1 `constants/theme.ts`

```typescript
// constants/theme.ts
export const COLORS = {
  primary: "#3B82F6",
  primaryDark: "#1D4ED8",
  secondary: "#1E293B",
  background: "#0A0F1D",
  surface: "#0F172A",
  surfaceLight: "#334155",
  white: "#FFFFFF",
  textMuted: "#94A3B8",
  danger: "#EF4444",
} as const;
```

### 4.2 Кореневий макет `app/_layout.tsx`

```tsx
// app/_layout.tsx
import "../global.css";

import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
```

### 4.3 Точка входу `app/index.tsx`

```tsx
// app/index.tsx
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/(app)" />;
}
```

---

## Крок 5: Запуск проєкту

Оскільки було налаштовано збирачі (Babel і Metro), запустіть сервер з прапорцем очищення кешу:

```bash
npx expo start -c
```

---

## Результат

- Налаштована файлова структура для додатку чату з динамічною маршрутизацією
- Повністю підключений Tailwind CSS (NativeWind v4) з палітрою теми
- Готова база для підключення Convex та авторизації
