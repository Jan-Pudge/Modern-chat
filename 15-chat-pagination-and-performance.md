# Інструкція 15: Пагінація повідомлень чату та оптимізація (Inverted FlatList & Convex Pagination)

У цій інструкції ми вирішимо критичну проблему продуктивності чатів масштабу Telegram / WhatsApp у нашому додатку **Modern Chat**:
замінимо повне завантаження всіх повідомлень кімнати (`.collect()`) на високоефективну **курсорну пагінацію (Cursor-based Pagination)** з інвертованим списком (**Inverted FlatList**).

---

## Зміст

1. [Проблема: чому звичайний `.collect()` ламає чати з великою історією](#проблема-чому-звичайний-collect-ламає-чати-з-великою-історією)
2. [Архітектура інвертованого списку (Inverted FlatList) та пагінації](#архітектура-інвертованого-списку-inverted-flatlist-та-пагінації)
3. [Крок 1: Backend — пагінований запит `getPaginatedMessages` у `convex/messages.ts`](#крок-1-backend--пагінований-запит-getpaginatedmessages-у-convexmessagests)
4. [Крок 2: Frontend — підключення `usePaginatedQuery` в екрані чату `app/chat/[id].tsx`](#крок-2-frontend--підключення-usepaginatedquery-в-екрані-чату-appchatidsx)
5. [Крок 3: Налаштування інвертованого списку `<FlatList inverted />`](#крок-3-налаштування-інвертованого-списку-flatlist-inverted-)
6. [Повні оновлені лістинги файлів](#повні-оновлені-лістинги-файлів)
7. [Тестування та чекліст перевірки](#тестування-та-чекліст-перевірки)

---

## Проблема: чому звичайний `.collect()` ламає чати з великою історією

У базовій версії месенджера повідомлення кімнати завантажувалися повністю за допомогою методу `.collect()`:

```typescript
// ❌ НЕПРАВИЛЬНО ДЛЯ АКТИВНИХ ЧАТІВ (Anti-pattern)
const messages = await ctx.db
  .query("messages")
  .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.chatRoomId))
  .collect();
```

### Наслідки завантаження всієї історії відразу:
1. **Затримка відкриття чату:** Якщо в кімнаті 2 000 – 10 000 повідомлень, смартфон завантажує кілька мегабайтів JSON по мережі перед тим, як показати хоч щось на екрані.
2. **Проблема N+1 при збагаченні авторами:** Якщо для кожного повідомлення підтягується профіль відправника (аватар, ім'я), для 5 000 повідомлень це 5 000 операцій читання з бази за один клієнтський запит.
3. **Переповнення пам'яті (OOM Crash):** Візуалізація тисяч текстових бульбашок, фотографій, аудіо та відеокружечків одночасно перевантажує пам'ять пристрою і призводить до аварійного закриття додатка.

---

## Архітектура інвертованого списку (Inverted FlatList) та пагінації

У мобільних чатах список повідомлень відображається **знизу вгору**:
- Найновіші повідомлення знаходяться внизу екрана (біля поля вводу).
- Старіші повідомлення знаходяться вище.

У React Native для цього використовується проп `inverted={true}` у компоненті `FlatList`:

```
┌──────────────────────────────────────────────┐
│  [ListFooterComponent]                       │ ◄── Візуально ЗВЕРХУ: спінер довантаження
│  ... Старі повідомлення (довантажуються) ... │
│  Повідомлення #2 (10:15)                     │
│  Повідомлення #1 (10:14)                     │
│  Повідомлення #0 (10:16) [Найновіше]         │ ◄── Нульовий індекс списку (внизу)
├──────────────────────────────────────────────┤
│  [ChatInput: Поле вводу та кнопки]           │
└──────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Особливість `inverted={true}`:**
> 1. Масив повідомлень повинен бути відсортований від **найновіших до найстаріших** (`order("desc")`).
> 2. Подія `onEndReached` спрацьовує, коли користувач скролить **вгору** (до кінця списку, тобто до старих повідомлень).
> 3. `ListFooterComponent` візуально рендериться **вгорі** списку — саме там, де має показуватися індикатор завантаження історії!

---

## Крок 1: Backend — пагінований запит `getPaginatedMessages` у `convex/messages.ts`

Відкрийте файл `convex/messages.ts`:

1. Імпортуйте `paginationOptsValidator` з `"convex/server"`:
   ```typescript
   import { paginationOptsValidator } from "convex/server";
   ```

2. Створіть пагіновану функцію запиту `getPaginatedMessages`:

```typescript
// convex/messages.ts

/**
 * Отримує повідомлення кімнати порціями (курсорна пагінація від найновіших до найстаріших)
 */
export const getPaginatedMessages = query({
  args: {
    chatRoomId: v.id("chatRooms"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    // 1. Завантажуємо порцію повідомлень за спаданням дати (спочатку найновіші)
    const paginated = await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.chatRoomId))
      .order("desc")
      .paginate(args.paginationOpts);

    if (paginated.page.length === 0) {
      return paginated;
    }

    // 2. Збагачуємо інформацією про авторів ТІЛЬКИ поточну завантажену порцію!
    const messagesWithSender = await Promise.all(
      paginated.page.map(async (msg) => {
        const sender = await ctx.db.get(msg.senderId);

        return {
          ...msg,
          sender: {
            _id: sender?._id,
            name: sender?.name ?? sender?.fullname ?? "Користувач",
            username: sender?.username,
            image: sender?.image,
          },
        };
      })
    );

    return {
      ...paginated,
      page: messagesWithSender,
    };
  },
});
```

---

## Крок 2: Frontend — підключення `usePaginatedQuery` в екрані чату `app/chat/[id].tsx`

Відкрийте файл екрана чату `app/chat/[id].tsx` (або `app/(tabs)/chat/[id].tsx` у вашому проєкті):

### 2.1 Імпортуйте `usePaginatedQuery`

```typescript
import { usePaginatedQuery } from "convex/react";
```

### 2.2 Замініть старий виклик `useQuery` на `usePaginatedQuery`

```typescript
// Кількість повідомлень в одній порції
const MESSAGES_PAGE_SIZE = 25;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatRoomId = id as Id<"chatRooms">;

  // Пагінований запит до Convex
  const {
    results: messages,
    status,
    loadMore,
    isLoading,
  } = usePaginatedQuery(
    api.messages.getPaginatedMessages,
    { chatRoomId },
    { initialNumItems: MESSAGES_PAGE_SIZE }
  );

  // Обробник довантаження при скролі вгору до старих повідомлень
  const handleLoadMore = () => {
    if (status === "CanLoadMore") {
      loadMore(MESSAGES_PAGE_SIZE);
    }
  };
```

---

## Крок 3: Налаштування інвертованого списку `<FlatList inverted />`

Замініть відображення списку на оптимізований `FlatList`:

```tsx
<FlatList
  data={messages}
  keyExtractor={(item) => item._id}
  inverted={true}
  renderItem={({ item }) => <MessageBubble message={item} />}
  showsVerticalScrollIndicator={false}
  contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16 }}
  onEndReached={handleLoadMore}
  onEndReachedThreshold={0.3}
  ListFooterComponent={
    status === "LoadingMore" ? (
      <View className="py-4 items-center w-full">
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    ) : null
  }
  ListEmptyComponent={
    !isLoading ? (
      <View className="py-12 items-center justify-center">
        <Text className="text-grey text-sm text-center">
          У цій кімнаті ще немає повідомлень.{"\n"}Напишіть першим!
        </Text>
      </View>
    ) : null
  }
/>
```

> [!TIP]
> Оскільки список інвертований, найновіше повідомлення має індекс `0`. Коли надходить нове повідомлення в реальному часі через Convex WebSocket, воно миттєво додається на початок масиву і плавно з'являється знизу без необхідності додаткового прокручування `scrollToEnd()`.

---

## Повні оновлені лістинги файлів

### `convex/messages.ts` (фрагмент)

```typescript
// convex/messages.ts
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Пагінація повідомлень кімнати (новий оптимізований запит)
 */
export const getPaginatedMessages = query({
  args: {
    chatRoomId: v.id("chatRooms"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    const paginated = await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", args.chatRoomId))
      .order("desc")
      .paginate(args.paginationOpts);

    if (paginated.page.length === 0) {
      return paginated;
    }

    const messagesWithSender = await Promise.all(
      paginated.page.map(async (msg) => {
        const sender = await ctx.db.get(msg.senderId);

        return {
          ...msg,
          sender: {
            _id: sender?._id,
            name: sender?.name ?? sender?.fullname ?? "Користувач",
            username: sender?.username,
            image: sender?.image,
          },
        };
      })
    );

    return {
      ...paginated,
      page: messagesWithSender,
    };
  },
});
```

---

## Тестування та чекліст перевірки

1. **Миттєве відкриття:** Відкрийте кімнату чату з великою кількістю повідомлень — екран відкривається миттєво, завантажуючи перші 25 повідомлень.
2. **Інвертоване положення:** Найновіші повідомлення знаходяться внизу біля поля вводу.
3. **Плавне довантаження історії:** При скролі вгору підвантажуються наступні 25 повідомлень без стрибків списку.
4. **Індикатор:** Під час підвантаження старих повідомлень у верхній частині списку з'являється невеликий `ActivityIndicator`.
5. **Realtime-синхронізація:** При надсиланні нового тексту, голосового чи відеокружечка нове повідомлення відразу з'являється внизу чату.
