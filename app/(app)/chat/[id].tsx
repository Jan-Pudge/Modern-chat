import { Ionicons } from "@expo/vector-icons";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { fetch } from "expo/fetch";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ImageViewerModal } from "../../../components/ImageViewerModal";
import { ReplyPreviewBar, ReplyTarget } from "../../../components/ReplyPreviewBar";
import { MessageItemData, SwipeableMessageItem } from "../../../components/SwipeableMessageItem";
import { TypingDots } from "../../../components/TypingDots";
import { VideoNoteRecorder } from "../../../components/VideoNoteRecorder";
import { COLORS } from "../../../constants/theme";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

const MESSAGES_PAGE_SIZE = 25;

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const insets = useSafeAreaInsets();

  const chatRoomId = id as Id<"chatRooms">;
  const room = useQuery(api.rooms.getRoom, { roomId: chatRoomId });
  const currentUser = useQuery(api.users.currentUser);
  const typingUsers = useQuery(api.typing.getTypingUsers, { chatRoomId });

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

  const sendMessage = useMutation(api.messages.sendMessage);
  const sendMediaMessage = useMutation(api.messages.sendMediaMessage);
  const sendAudioMessage = useMutation(api.messages.sendAudioMessage);
  const sendVideoNoteMessage = useMutation(api.messages.sendVideoNoteMessage);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const editMessage = useMutation(api.messages.editMessage);
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const setTyping = useMutation(api.typing.setTyping);

  const [inputText, setInputText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<Id<"messages"> | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVideoRecorderVisible, setIsVideoRecorderVisible] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const lastTypingCallRef = useRef<number>(0);

  const handleLoadMore = () => {
    if (status === "CanLoadMore") {
      loadMore(MESSAGES_PAGE_SIZE);
    }
  };

  const handleTextChange = (text: string) => {
    setInputText(text);

    const now = Date.now();
    if (now - lastTypingCallRef.current > 1500) {
      lastTypingCallRef.current = now;
      setTyping({ chatRoomId }).catch(console.error);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Дозвіл потрібен", "Надайте доступ до медіатеки для надсилання фотографій.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося вибрати зображення");
    }
  };

  const handleStartReply = (msg: MessageItemData) => {
    const rawMsg = msg as any;
    setReplyTarget({
      messageId: msg._id,
      senderName: msg.senderName,
      text: msg.content || (rawMsg.imageUrl ? "📷 Фотографія" : rawMsg.audioUrl ? "🎤 Голосове повідомлення" : rawMsg.videoUrl ? "📹 Відеоповідомлення" : ""),
    });
    setEditingMessageId(null);
  };

  const recordingStartTimeRef = useRef<number>(0);

  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Дозвіл не надано",
        "Для запису голосових повідомлень потрібен доступ до мікрофона."
      );
      return;
    }

    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      recordingStartTimeRef.current = Date.now();
    } catch (error) {
      console.error("Помилка початку запису:", error);
      Alert.alert("Помилка", "Не вдалося розпочати запис аудіо.");
    }
  };

  const cancelRecording = async () => {
    try {
      await audioRecorder.stop();
    } catch (error) {
      console.error("Помилка скасування запису:", error);
    }
  };

  const stopAndSendRecording = async () => {
    try {
      const elapsedMs = Date.now() - recordingStartTimeRef.current;
      const durationSeconds = Math.max(1, Math.floor(elapsedMs / 1000));

      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri || elapsedMs < 1000) {
        Alert.alert("Занадто коротке", "Голосове повідомлення занадто коротке (менше 1 с).");
        return;
      }

      setIsSubmitting(true);

      const uploadUrl = await generateUploadUrl();
      const file = new File(uri);

      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "audio/m4a" },
        body: file,
      });

      if (!uploadResult.ok) {
        const errorText = await uploadResult.text();
        console.error("Помилка Convex Storage:", errorText);
        throw new Error("Не вдалося завантажити аудіо");
      }

      const { storageId } = await uploadResult.json();

      await sendAudioMessage({
        chatRoomId,
        audioStorageId: storageId,
        audioDuration: durationSeconds,
        replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
        replyToSender: replyTarget?.senderName,
        replyToText: replyTarget?.text,
      });

      setReplyTarget(null);
    } catch (error) {
      console.error("Помилка завантаження аудіо:", error);
      Alert.alert("Помилка", "Не вдалося надіслати голосове повідомлення.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendVideoNote = async (videoUri: string, duration: number) => {
    try {
      setIsSubmitting(true);
      const uploadUrl = await generateUploadUrl();
      const file = new File(videoUri);

      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "video/mp4" },
        body: file,
      });

      if (!uploadResult.ok) {
        throw new Error("Не вдалося завантажити відео");
      }

      const { storageId } = await uploadResult.json();

      await sendVideoNoteMessage({
        chatRoomId,
        videoStorageId: storageId,
        videoDuration: duration,
        replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
        replyToSender: replyTarget?.senderName,
        replyToText: replyTarget?.text,
      });

      setReplyTarget(null);
    } catch (error) {
      console.error("Помилка надсилання відеокружечка:", error);
      Alert.alert("Помилка", "Не вдалося надіслати відеоповідомлення");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && !selectedImageUri) || isSubmitting) return;

    try {
      setIsSubmitting(true);

      if (editingMessageId) {
        await editMessage({
          messageId: editingMessageId,
          content: text,
        });
        setEditingMessageId(null);
      } else if (selectedImageUri) {
        const uploadUrl = await generateUploadUrl();
        const file = new File(selectedImageUri);

        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: file,
        });

        if (!uploadResult.ok) throw new Error("Не вдалося завантажити зображення");

        const { storageId } = await uploadResult.json();

        await sendMediaMessage({
          chatRoomId,
          storageId,
          caption: text || undefined,
          replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
          replyToSender: replyTarget?.senderName,
          replyToText: replyTarget?.text,
        });

        setSelectedImageUri(null);
        setReplyTarget(null);
      } else {
        await sendMessage({
          chatRoomId,
          content: text,
          replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
          replyToSender: replyTarget?.senderName,
          replyToText: replyTarget?.text,
        });

        setReplyTarget(null);
      }

      setInputText("");
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося надіслати повідомлення");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMessage = (messageId: Id<"messages">) => {
    Alert.alert("Видалити повідомлення?", "Ви впевнені, що хочете видалити повідомлення?", [
      { text: "Скасувати", style: "cancel" },
      {
        text: "Так, видалити",
        style: "destructive",
        onPress: () => deleteMessage({ messageId }),
      },
    ]);
  };

  const handleEditMessage = (item: MessageItemData) => {
    setEditingMessageId(item._id);
    setInputText(item.content || "");
    setReplyTarget(null);
  };

  const recordingSeconds = Math.floor((recorderState.durationMillis || 0) / 1000);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: room?.title ?? "Чат",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/settings/${chatRoomId}`)}
              className="p-1"
            >
              <Ionicons name="information-circle-outline" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      <FlatList
        data={messages}
        keyExtractor={(item) => item._id}
        inverted={true}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16 }}
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
              <Text className="text-white/50 text-sm text-center">
                У цій кімнаті ще немає повідомлень.{"\n"}Напишіть першим!
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SwipeableMessageItem
            item={item as MessageItemData}
            isOwn={item.senderId === currentUser?._id}
            onReply={handleStartReply}
            onEdit={handleEditMessage}
            onDelete={handleDeleteMessage}
            onImagePress={(url) => setFullscreenImage(url)}
            onAuthorPress={(authorId) => router.push(`/user/${authorId}` as any)}
          />
        )}
      />

      {typingUsers && typingUsers.length > 0 && <TypingDots typingUsers={typingUsers} />}

      {replyTarget && (
        <ReplyPreviewBar
          replyTarget={replyTarget}
          onCancel={() => setReplyTarget(null)}
        />
      )}

      {editingMessageId && (
        <View className="flex-row items-center justify-between px-4 py-2 bg-surfaceLight border-t border-surface">
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons name="pencil" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text className="text-white text-xs font-semibold">Редагування повідомлення</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setEditingMessageId(null);
              setInputText("");
            }}
          >
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {selectedImageUri && (
        <View className="flex-row items-center px-4 py-2 bg-surfaceLight border-t border-surface">
          <Image source={{ uri: selectedImageUri }} className="w-12 h-12 rounded-lg mr-3" />
          <Text className="text-white text-xs flex-1">Фото прикріплено</Text>
          <TouchableOpacity onPress={() => setSelectedImageUri(null)}>
            <Ionicons name="close-circle" size={22} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {recorderState.isRecording ? (
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 10) }}
          className="flex-row items-center justify-between px-4 pt-3 bg-surface border-t border-surfaceLight"
        >
          <View className="flex-row items-center gap-3">
            <View className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <Text className="text-white font-medium">Запис: {recordingSeconds} с</Text>
          </View>

          <View className="flex-row items-center gap-3">
            <TouchableOpacity onPress={cancelRecording} className="p-2 active:opacity-70">
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={stopAndSendRecording}
              className="w-11 h-11 rounded-full bg-primary items-center justify-center active:opacity-80"
            >
              <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 10) }}
          className="flex-row items-center px-3 pt-2 bg-surface border-t border-surfaceLight"
        >
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
              editingMessageId
                ? "Змініть текст..."
                : replyTarget
                ? `Відповідь для ${replyTarget.senderName}...`
                : selectedImageUri
                ? "Додайте підпис до фото..."
                : "Напишіть повідомлення..."
            }
            placeholderTextColor={COLORS.textMuted}
            value={inputText}
            onChangeText={handleTextChange}
            multiline
          />

          {inputText.trim().length > 0 || selectedImageUri ? (
            <TouchableOpacity
              onPress={handleSend}
              disabled={isSubmitting}
              className="w-11 h-11 rounded-full items-center justify-center bg-primary active:opacity-80"
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
          ) : (
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => setIsVideoRecorderVisible(true)}
                disabled={isSubmitting}
                className="w-11 h-11 rounded-full bg-surfaceLight items-center justify-center active:opacity-80"
              >
                <Ionicons name="videocam-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={startRecording}
                disabled={isSubmitting}
                className="w-11 h-11 rounded-full bg-surfaceLight items-center justify-center active:opacity-80"
              >
                <Ionicons name="mic" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <VideoNoteRecorder
        visible={isVideoRecorderVisible}
        onClose={() => setIsVideoRecorderVisible(false)}
        onSendVideo={handleSendVideoNote}
      />

      <ImageViewerModal
        visible={!!fullscreenImage}
        imageUrl={fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />
    </KeyboardAvoidingView>
  );
}