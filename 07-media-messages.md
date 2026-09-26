# Інструкція 7: Відправка зображень у чат (Media Messages)

У цій інструкції ми реалізуємо функціонал відправки фотографій у чат-кімнати за допомогою **Convex Storage**, вибору зображень із галереї телефону (`expo-image-picker`) та повноекранного перегляду надісланих фото.

---

## Зміст

1. [Крок 1: Встановлення необхідних бібліотек](#крок-1-встановлення-необхідних-бібліотек)
2. [Крок 2: Оновлення схеми бази даних у convex/schema.ts](#крок-2-оновлення-схеми-бази-даних-у-convexschemats)
3. [Крок 3: Серверні функції для завантаження файлів у convex/messages.ts](#крок-3-серверні-функції-для-завантаження-файлів-у-convexmessagests)
4. [Крок 4: Створення компонента повноекранного перегляду ImageViewerModal.tsx](#крок-4-створення-компонента-повноекранного-перегляду-imageviewermodaltsx)
5. [Крок 5: Інтеграція вибору та відправки фото у app/chat/[id].tsx](#крок-5-інтеграція-вибору-та-відправки-фото-у-appchatidtsx)

---

## Крок 1: Встановлення необхідних бібліотек

Для вибору зображень з галереї та роботи з локальними файлами на пристрої встановимо необхідні модулі Expo (якщо вони ще не були встановлені):

```bash
npx expo install expo-image-picker expo-file-system
```

---

## Крок 2: Оновлення схеми бази даних у `convex/schema.ts`

У таблиці `messages` додамо опціональні поля `imageUrl` та `storageId`, а поле `content` зробимо опціональним (адже повідомлення може містити тільки фото без підпису):

Відкрийте файл `convex/schema.ts` та оновіть визначення таблиці `messages`:

```typescript
// convex/schema.ts
  messages: defineTable({
    chatRoomId: v.id("chatRooms"),
    senderId: v.id("users"),
    senderName: v.string(),
    senderPhoto: v.optional(v.string()),
    content: v.optional(v.string()),          // Текст повідомлення (тепер опціональний)
    imageUrl: v.optional(v.string()),         // Публічне посилання на зображення
    storageId: v.optional(v.id("_storage")),  // ID файлу в Convex Storage
    isEdited: v.optional(v.boolean()),
  }).index("by_chat_room", ["chatRoomId"]),
```

---

## Крок 3: Серверні функції для завантаження файлів у `convex/messages.ts`

Додамо дві нові функції:
1. `generateUploadUrl`: генерує одноразовий URL для прямого завантаження картинки з клієнта у сховище Convex.
2. `sendMediaMessage`: зберігає повідомлення із зображенням та оновлює статус останнього повідомлення в кімнаті.

Відкрийте `convex/messages.ts` та додайте функції:

```typescript
// convex/messages.ts (додати в кінець файлу)

/**
 * Генерація тимчасового посилання для завантаження файлу в сховище
 */
export const generateUploadUrl = mutation(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Unauthorized: Потрібна авторизація");
  }
  return await ctx.storage.generateUploadUrl();
});

/**
 * Відправка повідомлення з медіафайлом (зображенням)
 */
export const sendMediaMessage = mutation({
  args: {
    chatRoomId: v.id("chatRooms"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
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

    // Отримуємо публічне посилання на збережений файл
    const imageUrl = await ctx.storage.getUrl(args.storageId);
    if (!imageUrl) {
      throw new Error("Не вдалося отримати URL завантаженого зображення");
    }

    const trimmedCaption = args.caption?.trim();

    // Створюємо повідомлення в базі
    const messageId = await ctx.db.insert("messages", {
      chatRoomId: args.chatRoomId,
      senderId: userId,
      senderName: user.name ?? user.email ?? "Користувач",
      senderPhoto: user.image,
      imageUrl,
      storageId: args.storageId,
      content: trimmedCaption,
    });

    // Оновлюємо інформацію про останнє повідомлення в кімнаті
    await ctx.db.patch(args.chatRoomId, {
      lastMessage: `${user.name ?? "Користувач"}: 📷 Фото ${
        trimmedCaption ? `(${trimmedCaption})` : ""
      }`,
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});
```

Також, якщо при видаленні повідомлення (`deleteMessage`) воно містить `storageId`, видаліть сам файл зі сховища:

```typescript
// У функції deleteMessage всередині convex/messages.ts додайте:
if (message.storageId) {
  await ctx.storage.delete(message.storageId);
}
```

---

## Крок 4: Створення компонента повноекранного перегляду `ImageViewerModal.tsx`

Створимо модальне вікно для зручного перегляду зображення на весь екран при тапі на картинку в чаті.

Створіть файл `components/ImageViewerModal.tsx`:

```tsx
// components/ImageViewerModal.tsx
import { Modal, View, Image, TouchableOpacity, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
};

export function ImageViewerModal({ visible, imageUrl, onClose }: Props) {
  if (!imageUrl) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-black justify-center items-center relative">
        {/* Кнопка закриття у правому верхньому кутку */}
        <TouchableOpacity
          onPress={onClose}
          className="absolute top-12 right-6 z-20 w-10 h-10 rounded-full bg-surface/80 items-center justify-center"
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Картинка */}
        <Image
          source={{ uri: imageUrl }}
          className="w-full h-4/5"
          resizeMode="contain"
        />
      </SafeAreaView>
    </Modal>
  );
}
```

---

## Крок 5: Інтеграція вибору та відправки фото у `app/chat/[id].tsx`

Тепер підключимо:
1. Кнопку вибору зображення із галереї біля інпута.
2. Завантаження файлу через `expo-file-system` та `expo/fetch`.
3. Відображення фотоповідомлень та їх відкриття у модальному вікні.

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
  Image,
} from "react-native";
import { useState, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/theme";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { ImageViewerModal } from "@/components/ImageViewerModal";

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
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const sendMediaMessage = useMutation(api.messages.sendMediaMessage);

  const [inputText, setInputText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<Id<"messages"> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Вибір фото з галереї
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  // Відправка текстового повідомлення або фото
  const handleSend = async () => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      if (selectedImageUri) {
        // Відправка фотографії з опціональним описом
        const uploadUrl = await generateUploadUrl();
        const file = new File(selectedImageUri);

        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: file,
        });

        if (!uploadResponse.ok) throw new Error("Upload failed");

        const { storageId } = await uploadResponse.json();
        await sendMediaMessage({
          chatRoomId,
          storageId,
          caption: inputText.trim() || undefined,
        });

        setSelectedImageUri(null);
        setInputText("");
      } else if (editingMessageId) {
        // Редагування існуючого
        await editMessage({
          messageId: editingMessageId,
          content: inputText.trim(),
        });
        setEditingMessageId(null);
        setInputText("");
      } else if (inputText.trim()) {
        // Звичайне текстове повідомлення
        await sendMessage({
          chatRoomId,
          content: inputText.trim(),
        });
        setInputText("");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося відправити повідомлення");
    } finally {
      setIsSubmitting(false);
    }
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
      {/* Хедер чату */}
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
        renderItem={({ item }) => {
          const isMe = item.senderId === currentUser?._id;

          return (
            <View className={`mb-3 max-w-[80%] ${isMe ? "self-end" : "self-start"}`}>
              <View
                className={`p-3 rounded-2xl ${
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

                {/* Якщо це фотоповідомлення */}
                {item.imageUrl && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setFullscreenImage(item.imageUrl!)}
                    className="mb-1 rounded-xl overflow-hidden"
                  >
                    <Image
                      source={{ uri: item.imageUrl }}
                      className="w-56 h-56 rounded-xl bg-surfaceLight"
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}

                {/* Текстовий зміст */}
                {item.content ? (
                  <Text className="text-white text-base leading-5">{item.content}</Text>
                ) : null}

                {/* Час та позначки */}
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
            </View>
          );
        }}
      />

      {/* Прев'ю обраної картинки перед відправкою */}
      {selectedImageUri && (
        <View className="flex-row items-center px-4 py-2 bg-surfaceLight border-t border-surface">
          <Image
            source={{ uri: selectedImageUri }}
            className="w-12 h-12 rounded-lg mr-3"
          />
          <Text className="text-white text-xs flex-1">Фото додано до відправки</Text>
          <TouchableOpacity onPress={() => setSelectedImageUri(null)}>
            <Ionicons name="close-circle" size={22} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Панель введення */}
      <View className="flex-row items-center p-3 bg-surface border-t border-surfaceLight">
        <TouchableOpacity
          onPress={pickImage}
          disabled={isSubmitting}
          className="mr-2 p-2 rounded-full bg-surfaceLight"
        >
          <Ionicons name="image-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>

        <TextInput
          className="flex-1 bg-background text-white px-4 py-2.5 rounded-full text-base border border-surfaceLight mr-2"
          placeholder={
            selectedImageUri ? "Додайте опис до фото..." : "Напишіть повідомлення..."
          }
          placeholderTextColor={COLORS.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        <TouchableOpacity
          onPress={handleSend}
          disabled={(!inputText.trim() && !selectedImageUri) || isSubmitting}
          className={`w-11 h-11 rounded-full items-center justify-center bg-primary ${
            (!inputText.trim() && !selectedImageUri) || isSubmitting
              ? "opacity-50"
              : "active:opacity-80"
          }`}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      {/* Повноекранний переглядач фото */}
      <ImageViewerModal
        visible={!!fullscreenImage}
        imageUrl={fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />
    </KeyboardAvoidingView>
  );
}
```

---

## Наступний крок

Ми реалізували відправку зображень та повноекранний перегляд фото у чаті. Наступний крок — створення індикатора набору тексту в реальному часі ("User is typing...").

Переходьте до **[Інструкція 8: Індикатор набору тексту (Typing Indicator)](./08-typing-indicator.md)**.
