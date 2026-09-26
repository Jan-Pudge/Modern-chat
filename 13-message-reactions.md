# Інструкція 13: Швидкі реакції емодзі на повідомлення (Message Reactions у реальному часі)

У цій інструкції ми додамо до нашого месенджера **Modern Chat** систему інтерактивних реакцій емодзі на повідомлення (Message Reactions) у реальному часі, як у **Telegram**, **Slack** та **Discord**.

Користувачі зможуть ставити швидкі реакції (👍, ❤️, 😂, 🔥, 😮, 😢) за допомогою меню довгого натискання, бачити лічильники реакцій під повідомленням та миттєво синхронізувати їх між усіма учасниками кімнати.

---

## Зміст

1. [Архітектура та логіка роботи реакцій](#архітектура-та-логіка-роботи-реакцій)
2. [Крок 1: Оновлення схеми бази даних `convex/schema.ts`](#крок-1-оновлення-схеми-бази-даних-convexschemats)
3. [Крок 2: Створення серверних функцій `convex/reactions.ts`](#крок-2-створення-серверних-функцій-convexreactionsts)
4. [Крок 3: Створення компонента вибору емодзі `components/ReactionPickerModal.tsx`](#крок-3-створення-компонента-вибору-емодзі-componentsreactionpickermodaltsx)
5. [Крок 4: Створення компонента бейджів реакцій `components/ReactionBadges.tsx`](#крок-4-створення-компонента-бейджів-реакцій-componentsreactionbadgestsx)
6. [Крок 5: Інтеграція реакцій у `components/MessageBubble.tsx`](#крок-5-інтеграція-реакцій-у-componentsmessagebubbletsx)
7. [Повні оновлені лістинги файлів](#повні-оновлені-лістинги-файлів)
8. [Тестування та перевірка роботи](#тестування-та-перевірка-роботи)

---

## Архітектура та логіка роботи реакцій

```
[Довге натискання на повідомлення у MessageBubble]
                   │
                   ▼
[ReactionPickerModal: вибір емодзі 👍 ❤️ 😂 🔥 😮 😢]
                   │
                   ▼
[Мутація api.reactions.toggleReaction]
    ├── Якщо такий емодзі вже стоїть від цього юзера ──► Видалити (зняти реакцію)
    └── Якщо ще не стоїть ──► Додати новий запис у таблицю messageReactions
                   │
                   ▼
[Реактивний Convex Query: getMessageReactions]
                   │
                   ▼
[ReactionBadges: бейджі з емодзі, лічильником та підсвічуванням "активного"]
```

---

## Крок 1: Оновлення схеми бази даних `convex/schema.ts`

Відкрийте файл `convex/schema.ts` та додайте нову таблицю `messageReactions`:

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ... існуючі таблиці (users, chatRooms, messages, typingIndicators)

  // Нова таблиця для збереження реакцій:
  messageReactions: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(), // наприклад "👍", "❤️", "🔥"
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_and_user", ["messageId", "userId"]),
});
```

---

## Крок 2: Створення серверних функцій `convex/reactions.ts`

Створіть новий файл `convex/reactions.ts`:

```typescript
// convex/reactions.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Мутація для додавання або зняття реакції (Toggle)
 */
export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Необхідно авторизуватися");
    }

    // Шукаємо, чи ставив уже цей користувач саме такий емодзі
    const existing = await ctx.db
      .query("messageReactions")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", userId)
      )
      .filter((q) => q.eq(q.field("emoji"), args.emoji))
      .first();

    if (existing) {
      // Якщо вже стоїть — видаляємо (зняття реакції)
      await ctx.db.delete(existing._id);
      return { action: "removed", emoji: args.emoji };
    } else {
      // Якщо не стоїть — додаємо
      await ctx.db.insert("messageReactions", {
        messageId: args.messageId,
        userId,
        emoji: args.emoji,
        createdAt: Date.now(),
      });
      return { action: "added", emoji: args.emoji };
    }
  },
});

/**
 * Отримання списку реакцій для списку або одного повідомлення
 */
export const getMessageReactions = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const rawReactions = await ctx.db
      .query("messageReactions")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();

    // Групуємо реакції за емодзі
    const map = new Map<
      string,
      { emoji: string; count: number; hasReacted: boolean }
    >();

    for (const r of rawReactions) {
      const item = map.get(r.emoji) || {
        emoji: r.emoji,
        count: 0,
        hasReacted: false,
      };
      item.count += 1;
      if (userId && r.userId === userId) {
        item.hasReacted = true;
      }
      map.set(r.emoji, item);
    }

    return Array.from(map.values());
  },
});
```

---

## Крок 3: Створення компонента вибору емодзі `components/ReactionPickerModal.tsx`

Створіть файл `components/ReactionPickerModal.tsx`:

```tsx
import React from "react";
import { View, Text, TouchableOpacity, Modal, Pressable } from "react-native";

const POPULAR_EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "😢"];

interface ReactionPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
}

export const ReactionPickerModal: React.FC<ReactionPickerModalProps> = ({
  visible,
  onClose,
  onSelectEmoji,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/50 justify-center items-center px-4"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-surface border border-surfaceLight rounded-3xl p-3 flex-row items-center gap-2 shadow-2xl"
        >
          {POPULAR_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => {
                onSelectEmoji(emoji);
                onClose();
              }}
              className="w-12 h-12 rounded-2xl bg-surfaceLight/80 items-center justify-center active:scale-125"
              activeOpacity={0.7}
            >
              <Text className="text-2xl">{emoji}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
};
```

---

## Крок 4: Створення компонента бейджів реакцій `components/ReactionBadges.tsx`

Створіть файл `components/ReactionBadges.tsx`:

```tsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface ReactionBadgesProps {
  messageId: Id<"messages">;
}

export const ReactionBadges: React.FC<ReactionBadgesProps> = ({
  messageId,
}) => {
  const reactions = useQuery(api.reactions.getMessageReactions, { messageId });
  const toggleReaction = useMutation(api.reactions.toggleReaction);

  if (!reactions || reactions.length === 0) {
    return null;
  }

  const handleToggle = async (emoji: string) => {
    try {
      await toggleReaction({ messageId, emoji });
    } catch (error) {
      console.error("Помилка встановлення реакції:", error);
    }
  };

  return (
    <View className="flex-row flex-wrap gap-1.5 mt-1.5">
      {reactions.map((r) => (
        <TouchableOpacity
          key={r.emoji}
          onPress={() => handleToggle(r.emoji)}
          activeOpacity={0.7}
          className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full border ${
            r.hasReacted
              ? "bg-primary/20 border-primary"
              : "bg-surfaceLight/70 border-surfaceLight"
          }`}
        >
          <Text className="text-xs">{r.emoji}</Text>
          <Text
            className={`text-xs font-semibold ${
              r.hasReacted ? "text-primary" : "text-grey"
            }`}
          >
            {r.count}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
```

---

## Крок 5: Інтеграція реакцій у `components/MessageBubble.tsx`

Відкрийте файл `components/MessageBubble.tsx`:

1. Додайте стан відкриття вікна вибору реакцій та підключіть компоненти:

```tsx
import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReactionPickerModal } from "./ReactionPickerModal";
import { ReactionBadges } from "./ReactionBadges";

// Всередині компонента MessageBubble:
export const MessageBubble = ({ message, isMyMessage, ...props }) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const toggleReaction = useMutation(api.reactions.toggleReaction);

  const handleSelectEmoji = async (emoji: string) => {
    try {
      await toggleReaction({ messageId: message._id, emoji });
    } catch (error) {
      console.error("Помилка реакції:", error);
    }
  };

  return (
    <View className="mb-2">
      {/* Обгортка бульбашки з викликом по довгому натисканню */}
      <TouchableOpacity
        onLongPress={() => setShowReactionPicker(true)}
        activeOpacity={0.9}
      >
        {/* ... вміст бульбашки повідомлення */}
      </TouchableOpacity>

      {/* Бейджі реакцій під бульбашкою */}
      <ReactionBadges messageId={message._id} />

      {/* Модальне вікно вибору емодзі */}
      <ReactionPickerModal
        visible={showReactionPicker}
        onClose={() => setShowReactionPicker(false)}
        onSelectEmoji={handleSelectEmoji}
      />
    </View>
  );
};
```

---

## Повні оновлені лістинги файлів

Перевірте, що всі файли створені:
- `convex/schema.ts` (таблиця `messageReactions`)
- `convex/reactions.ts` (мутація `toggleReaction`, запит `getMessageReactions`)
- `components/ReactionPickerModal.tsx`
- `components/ReactionBadges.tsx`
- `components/MessageBubble.tsx`

---

## Тестування та перевірка роботи

1. Запустіть додаток під двома різними обліковими записами у двох вікнах/пристроях.
2. Затисніть будь-яке повідомлення (Long Press) — з'явиться спливаюча панель з емодзі.
3. Оберіть емодзі (наприклад, 🔥).
4. Переконайтеся, що під повідомленням з'явився бейдж `🔥 1`, підсвічений акцентним кольором.
5. Натисніть на цей же бейдж на іншому пристрої — лічильник збільшиться до `🔥 2`.
6. Натисніть на бейдж повторно — реакція зніметься, а лічильник зменшиться.
