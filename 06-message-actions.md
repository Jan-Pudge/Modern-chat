# Інструкція 6: Редагування та Видалення Повідомлень

У цій інструкції ми розширимо можливості нашого чату **Modern Chat**, додавши користувачам можливість редагувати власні повідомлення з позначкою `(ред.)` та видаляти помилково надіслані репліки.

---

## Зміст

1. [Крок 1: Оновлення схеми бази даних у convex/schema.ts](#крок-1-оновлення-схеми-бази-даних-у-convexschemats)
2. [Крок 2: Серверні мутації editMessage та deleteMessage у convex/messages.ts](#крок-2-серверні-мутації-editmessage-та-deletemessage-у-convexmessagests)
3. [Крок 3: Оновлення інтерфейсу чату app/chat/[id].tsx](#крок-3-оновлення-інтерфейсу-чату-appchatidtsx)

---

## Крок 1: Оновлення схеми бази даних у `convex/schema.ts`

Додамо до таблиці `messages` опціональний прапорець `isEdited`, який вказуватиме, чи редагувалося повідомлення.

Відкрийте файл `convex/schema.ts` та оновіть таблицю `messages`:

```typescript
// convex/schema.ts
  messages: defineTable({
    chatRoomId: v.id("chatRooms"),
    senderId: v.id("users"),
    senderName: v.string(),
    senderPhoto: v.optional(v.string()),
    content: v.string(),
    isEdited: v.optional(v.boolean()), // Прапорець редагування
  }).index("by_chat_room", ["chatRoomId"]),
```

---

## Крок 2: Серверні мутації `editMessage` та `deleteMessage` у `convex/messages.ts`

Додамо дві нові серверні мутації:
1. `editMessage`: перевіряє авторизацію, перевіряє право власності на повідомлення та оновлює його текст і встановлює `isEdited: true`.
2. `deleteMessage`: перевіряє авторство та видаляє повідомлення. Якщо видаляється останнє повідомлення в кімнаті, оновлює інформацію про останнє повідомлення в `chatRooms`.

Відкрийте файл `convex/messages.ts` та додайте мутації в кінець файлу:

```typescript
// convex/messages.ts (додати в кінець файлу)

/**
 * Редагування тексту власного повідомлення
 */
export const editMessage = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found: Повідомлення не знайдено");
    }

    // Редагувати дозволено лише власні повідомлення
    if (message.senderId !== userId) {
      throw new Error("Forbidden: Ви можете редагувати лише власні повідомлення");
    }

    const trimmedContent = args.content.trim();
    if (!trimmedContent) {
      throw new Error("Повідомлення не може бути порожнім");
    }

    // Оновлюємо текст повідомлення
    await ctx.db.patch(args.messageId, {
      content: trimmedContent,
      isEdited: true,
    });

    // Якщо це останнє повідомлення в кімнаті — оновлюємо прев'ю кімнати
    const room = await ctx.db.get(message.chatRoomId);
    if (room && room.lastMessageAt === message._creationTime) {
      await ctx.db.patch(message.chatRoomId, {
        lastMessage: `${message.senderName}: ${trimmedContent}`,
      });
    }
  },
});

/**
 * Видалення власного повідомлення
 */
export const deleteMessage = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found: Повідомлення не знайдено");
    }

    // Видаляти дозволено лише власні повідомлення
    if (message.senderId !== userId) {
      throw new Error("Forbidden: Ви можете видаляти лише власні повідомлення");
    }

    await ctx.db.delete(args.messageId);

    // Оновлюємо останнє повідомлення кімнати на попереднє (якщо видалено останнє)
    const lastRemainingMessage = await ctx.db
      .query("messages")
      .withIndex("by_chat_room", (q) => q.eq("chatRoomId", message.chatRoomId))
      .order("desc")
      .first();

    await ctx.db.patch(message.chatRoomId, {
      lastMessage: lastRemainingMessage
        ? `${lastRemainingMessage.senderName}: ${lastRemainingMessage.content}`
        : "Повідомлень немає",
      lastMessageAt: lastRemainingMessage?._creationTime ?? Date.now(),
    });
  },
});
```

---

## Крок 3: Оновлення інтерфейсу чату `app/chat/[id].tsx`

Додамо підтримку взаємодії з повідомленнями:
- Довге натискання на власне повідомлення (`onLongPress`) відкриває меню вибору дії (Редагувати / Видалити).
- При редагуванні поле введення переходить у режим «Редагування» з кнопкою скасування.
- Біля часу відправлення відредагованого повідомлення відображається мітка `(ред.)`.

Оновіть файл `app/chat/[id].tsx`:

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
} from "react-native";
import { useState, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const chatRoomId = id as Id<"chatRooms">;
  const room = useQuery(api.rooms.getRoom, { roomId: chatRoomId });
  const messages = useQuery(api.messages.listMessages, { chatRoomId });
  const currentUser = useQuery(api.users.currentUser);

  const sendMessage = useMutation(api.messages.sendMessage);
  const editMessage = useMutation(api.messages.editMessage);
  const deleteMessage = useMutation(api.messages.deleteMessage);

  const [inputText, setInputText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<Id<"messages"> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Відправка нового повідомлення або збереження змін
  const handleSendOrSave = async () => {
    const text = inputText.trim();
    if (!text || isSubmitting) return;

    try {
      setIsSubmitting(true);

      if (editingMessageId) {
        // Режим збереження редагування
        await editMessage({
          messageId: editingMessageId,
          content: text,
        });
        setEditingMessageId(null);
      } else {
        // Режим відправки нового повідомлення
        await sendMessage({
          chatRoomId,
          content: text,
        });
      }

      setInputText("");
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося виконати дію");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Меню дій над власним повідомленням
  const handleMessageLongPress = (message: {
    _id: Id<"messages">;
    senderId: Id<"users">;
    content: string;
  }) => {
    // Дії доступні тільки для власних повідомлень
    if (message.senderId !== currentUser?._id) return;

    Alert.alert("Дії з повідомленням", "Оберіть дію:", [
      {
        text: "Редагувати",
        onPress: () => {
          setEditingMessageId(message._id);
          setInputText(message.content);
        },
      },
      {
        text: "Видалити",
        style: "destructive",
        onPress: () => confirmDelete(message._id),
      },
      { text: "Скасувати", style: "cancel" },
    ]);
  };

  // Підтвердження видалення
  const confirmDelete = (messageId: Id<"messages">) => {
    Alert.alert("Видалити повідомлення", "Ви впевнені, що хочете видалити повідомлення?", [
      { text: "Ні", style: "cancel" },
      {
        text: "Так, видалити",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMessage({ messageId });
          } catch (err) {
            console.error(err);
            Alert.alert("Помилка", "Не вдалося видалити повідомлення");
          }
        },
      },
    ]);
  };

  // Скасування режиму редагування
  const cancelEditing = () => {
    setEditingMessageId(null);
    setInputText("");
  };

  if (!room || messages === undefined) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      {/* Хедер чат-кімнати */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-surface border-b border-surfaceLight">
        <View className="flex-row items-center flex-1 mr-3">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold" numberOfLines={1}>
              {room.title}
            </Text>
            {room.description ? (
              <Text className="text-textMuted text-xs" numberOfLines={1}>
                {room.description}
              </Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push(`/settings/${chatRoomId}`)}
          className="p-1"
        >
          <Ionicons name="ellipsis-vertical" size={22} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Список повідомлень */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center py-20">
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} />
            <Text className="text-textMuted text-sm mt-3">Тут ще немає повідомлень</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.senderId === currentUser?._id;

          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onLongPress={() => handleMessageLongPress(item)}
              delayLongPress={300}
              className={`mb-3 max-w-[80%] ${isMe ? "self-end" : "self-start"}`}
            >
              <View
                className={`p-3.5 rounded-2xl ${
                  isMe
                    ? "bg-primary rounded-tr-xs"
                    : "bg-surface border border-surfaceLight rounded-tl-xs"
                }`}
              >
                {!isMe && (
                  <Text className="text-primary font-bold text-xs mb-1">
                    {item.senderName}
                  </Text>
                )}
                <Text className="text-white text-base leading-5">{item.content}</Text>
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

      {/* Панель редагування повідомлення (якщо увімкнено) */}
      {editingMessageId && (
        <View className="flex-row items-center justify-between px-4 py-2 bg-surfaceLight border-t border-surface">
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons name="pencil" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text className="text-white text-xs font-semibold">Редагування повідомлення</Text>
          </View>
          <TouchableOpacity onPress={cancelEditing}>
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Панель введення тексту */}
      <View className="flex-row items-center p-3 bg-surface border-t border-surfaceLight">
        <TextInput
          className="flex-1 bg-background text-white px-4 py-2.5 rounded-full text-base border border-surfaceLight mr-2"
          placeholder={editingMessageId ? "Змініть текст..." : "Напишіть повідомлення..."}
          placeholderTextColor={COLORS.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        <TouchableOpacity
          onPress={handleSendOrSave}
          disabled={!inputText.trim() || isSubmitting}
          className={`w-11 h-11 rounded-full items-center justify-center bg-primary ${
            !inputText.trim() || isSubmitting ? "opacity-50" : "active:opacity-80"
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
    </KeyboardAvoidingView>
  );
}
```

---

## Наступний крок

Тепер користувачі можуть редагувати та видаляти свої репліки. Перейдемо до можливості надсилати фотографії у чат за допомогою Convex Storage.

Переходьте до **[Інструкція 7: Відправка зображень у чат (Media Messages)](./07-media-messages.md)**.
