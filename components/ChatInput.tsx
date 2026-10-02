import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { VideoNoteRecorder } from "./VideoNoteRecorder";

interface ChatInputProps {
  chatRoomId: Id<"chatRooms">;
  replyTo?: {
    id: Id<"messages">;
    sender: string;
    text: string;
  } | null;
  onCancelReply?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  chatRoomId,
  replyTo,
  onCancelReply,
}) => {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVideoRecorderVisible, setIsVideoRecorderVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const bottomPadding = isKeyboardVisible ? 0 : Math.max(insets.bottom, 10);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const sendAudioMessage = useMutation(api.messages.sendAudioMessage);
  const sendVideoNote = useMutation(api.messages.sendVideoNoteMessage);
  const sendMessage = useMutation(api.messages.sendMessage);

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
      Vibration.vibrate(50);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      console.error("Помилка початку запису:", error);
      Alert.alert("Помилка", "Не вдалося розпочати запис аудіо.");
    }
  };

  const cancelRecording = async () => {
    try {
      Vibration.vibrate(50);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await audioRecorder.stop();
    } catch (error) {
      console.error("Помилка скасування запису:", error);
    }
  };

  const stopAndSendRecording = async () => {
    try {
      Vibration.vibrate(50);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const durationSeconds = Math.round(
        (recorderState.durationMillis || 0) / 1000
      );

      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri || durationSeconds < 1) {
        Alert.alert("Занадто коротке", "Голосове повідомлення занадто коротке.");
        return;
      }

      setIsSending(true);

      const uploadUrl = await generateUploadUrl();

      const uploadResult = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": "audio/m4a" },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        console.error("Помилка завантаження аудіо:", uploadResult.body);
        throw new Error("Не вдалося завантажити аудіо");
      }

      const { storageId } = JSON.parse(uploadResult.body);

      await sendAudioMessage({
        chatRoomId,
        audioStorageId: storageId,
        audioDuration: durationSeconds,
        replyToId: replyTo?.id,
        replyToSender: replyTo?.sender,
        replyToText: replyTo?.text,
      });

      if (onCancelReply) onCancelReply();
    } catch (error) {
      console.error("Помилка завантаження аудіо:", error);
      Alert.alert("Помилка", "Не вдалося надіслати голосове повідомлення.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendVideoNote = async (videoUri: string, duration: number) => {
    try {
      setIsSending(true);
      const uploadUrl = await generateUploadUrl();

      const uploadResult = await FileSystem.uploadAsync(uploadUrl, videoUri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": "video/mp4" },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        console.error("Помилка завантаження відео:", uploadResult.body);
        throw new Error("Не вдалося завантажити відео");
      }

      const { storageId } = JSON.parse(uploadResult.body);

      await sendVideoNote({
        chatRoomId,
        videoStorageId: storageId,
        videoDuration: duration,
        replyToId: replyTo?.id,
        replyToSender: replyTo?.sender,
        replyToText: replyTo?.text,
      });

      if (onCancelReply) onCancelReply();
    } catch (error) {
      console.error("Помилка надсилання відеокружечка:", error);
      Alert.alert("Помилка", "Не вдалося надіслати відеоповідомлення");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendText = async () => {
    if (!text.trim() || isSending) return;
    try {
      setIsSending(true);
      await sendMessage({
        chatRoomId,
        content: text.trim(),
        replyToId: replyTo?.id,
        replyToSender: replyTo?.sender,
        replyToText: replyTo?.text,
      });
      setText("");
      if (onCancelReply) onCancelReply();
    } finally {
      setIsSending(false);
    }
  };

  const recordingSeconds = Math.floor(
    (recorderState.durationMillis || 0) / 1000
  );

  return (
    <View
      style={{ paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }}
      className="bg-zinc-950"
    >
      {replyTo && (
        <View className="flex-row items-center justify-between px-4 py-2 bg-zinc-900 border-t border-zinc-800 border-l-2 border-l-blue-500">
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons
              name="arrow-undo"
              size={18}
              color="#3B82F6"
              style={{ marginRight: 8 }}
            />
            <View className="flex-1">
              <Text className="text-blue-400 font-semibold text-xs">
                Відповідь для {replyTo.sender}
              </Text>
              <Text className="text-zinc-300 text-xs mt-0.5" numberOfLines={1}>
                {replyTo.text || "📷 Зображення"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onCancelReply}
            className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center active:opacity-70"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="close" size={16} color="#A1A1AA" />
          </TouchableOpacity>
        </View>
      )}

      {recorderState.isRecording ? (
        <View
          style={{ paddingBottom: bottomPadding }}
          className="flex-row items-center justify-between px-4 py-2.5 border-t border-zinc-800 bg-zinc-950"
        >
          <View className="flex-row items-center gap-3">
            <View className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <Text className="text-white font-medium text-sm">
              Запис: {recordingSeconds} с
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={cancelRecording}
              className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center flex-shrink-0 active:opacity-70"
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={stopAndSendRecording}
              className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center flex-shrink-0 active:opacity-80 shadow-sm"
            >
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View
          style={{ paddingBottom: bottomPadding }}
          className="flex-row items-center px-4 py-2.5 border-t border-zinc-800 bg-zinc-950"
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Напишіть повідомлення..."
            placeholderTextColor="#71717A"
            className="flex-1 text-white py-2.5 px-4 mr-2 bg-zinc-900 rounded-full text-sm border border-zinc-800"
            multiline
            style={{ maxHeight: 120 }}
          />

          {text.trim().length > 0 ? (
            <TouchableOpacity
              onPress={handleSendText}
              disabled={isSending}
              className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center flex-shrink-0 active:opacity-80 shadow-sm"
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          ) : (
            <View className="flex-row items-center gap-1.5 flex-shrink-0">
              <TouchableOpacity
                onPress={() => setIsVideoRecorderVisible(true)}
                disabled={isSending}
                className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center flex-shrink-0 active:opacity-80"
              >
                <Ionicons name="videocam-outline" size={20} color="#A1A1AA" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={startRecording}
                disabled={isSending}
                className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center flex-shrink-0 active:opacity-80"
              >
                <Ionicons name="mic-outline" size={20} color="#A1A1AA" />
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
    </View>
  );
};