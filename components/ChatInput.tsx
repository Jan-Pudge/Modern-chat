import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVideoRecorderVisible, setIsVideoRecorderVisible] = useState(false);

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
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
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

      const response = await fetch(uri);
      const blob = await response.blob();

      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "audio/m4a" },
        body: blob,
      });

      const { storageId } = await uploadResult.json();

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

      const response = await fetch(videoUri);
      const blob = await response.blob();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "video/mp4" },
        body: blob,
      });

      const { storageId } = await result.json();

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
    <View className="bg-surface border-t border-surfaceLight p-3">
      {recorderState.isRecording ? (
        <View className="flex-row items-center justify-between bg-surfaceLight/60 px-4 py-2.5 rounded-2xl">
          <View className="flex-row items-center gap-3">
            <View className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <Text className="text-white font-medium">
              Запис: {recordingSeconds} с
            </Text>
          </View>

          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={cancelRecording}
              className="p-2 active:opacity-70"
            >
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={stopAndSendRecording}
              className="w-10 h-10 rounded-full bg-primary items-center justify-center active:opacity-80"
            >
              <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Напишіть повідомлення..."
            placeholderTextColor="#666"
            className="flex-1 bg-surfaceLight text-white px-4 py-3 rounded-2xl text-base max-h-24"
            multiline
          />

          {text.trim().length > 0 ? (
            <TouchableOpacity
              onPress={handleSendText}
              disabled={isSending}
              className="w-11 h-11 rounded-full bg-primary items-center justify-center active:opacity-80"
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="arrow-up" size={22} color="#FFF" />
              )}
            </TouchableOpacity>
          ) : (
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => setIsVideoRecorderVisible(true)}
                disabled={isSending}
                className="w-11 h-11 rounded-full bg-surfaceLight items-center justify-center active:opacity-80"
              >
                <Ionicons name="videocam-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={startRecording}
                disabled={isSending}
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
    </View>
  );
};