# Інструкція 2: Підключення Convex та Схема Бази Даних

Покрокова інструкція з налаштування серверного бекенду **Convex** для зберігання даних чат-кімнат та повідомлень у реальному часі.

---

## Що таке Convex?

**Convex** — це реактивна serverless-платформа, яка ідеально підходить для чат-додатків. Вона автоматично підтримує WebSocket-з'єднання з клієнтом, завдяки чому нові кімнати та повідомлення з'являються на екрані миттєво без ручного polling або складного менеджменту сокетів.

---

## Крок 1: Встановлення Convex

Встановіть офіційний пакет Convex:

```bash
npm install convex
```

---

## Крок 2: Ініціалізація бекенду

Запустіть команду розробника:

```bash
npx convex dev
```

Під час виконання команди:
1. Авторизуйтесь у Convex через браузер.
2. Створіть новий проєкт (наприклад, `modern-chat`).
3. Команда згенерує папку `convex/` у вашому проєкті та створить файл `.env.local` з URL-адресою бекенду (наприклад, `EXPO_PUBLIC_CONVEX_URL=https://...convex.cloud`).

---

## Крок 3: Створення схеми бази даних (`convex/schema.ts`)

У додатку чату нам знадобляться три основні сутності:
1. **Користувачі (`users`)** — ім'я, аватар, email.
2. **Чат-кімнати (`chatRooms`)** — назва, опис, автор (`creatorId`), останнє повідомлення та час.
3. **Повідомлення (`messages`)** — прив'язка до кімнати (`chatRoomId`), автор (`senderId`), ім'я відправника, фото та текст.

Створіть файл `convex/schema.ts`:

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // Системні таблиці авторизації Convex Auth
  ...authTables,

  // Користувачі
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // Чат-кімнати
  chatRooms: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    creatorId: v.id("users"),
    lastMessage: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
  }).index("by_creator", ["creatorId"]),

  // Повідомлення в кімнатах
  messages: defineTable({
    chatRoomId: v.id("chatRooms"),
    senderId: v.id("users"),
    senderName: v.string(),
    senderPhoto: v.optional(v.string()),
    content: v.string(),
  }).index("by_chat_room", ["chatRoomId"]),
});
```

---

## Крок 4: Створення клієнтської функції користувача (`convex/users.ts`)

Створимо функцію для отримання даних поточного авторизованого користувача:

```typescript
// convex/users.ts
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});
```

---

## Наступний крок

Схема бази даних готова. Переходимо до налаштування автентифікації користувачів через Convex Auth: **[Інструкція 3: Автентифікація Convex Auth](./03-convex-auth.md)**.
