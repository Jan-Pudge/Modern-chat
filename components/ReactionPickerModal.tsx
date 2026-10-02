import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Modal, Pressable, Text, TouchableOpacity, Vibration, View } from "react-native";
import { COLORS } from "../constants/theme";

const POPULAR_EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "😢"];

interface ReactionPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  isOwn?: boolean;
  canEdit?: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const ReactionPickerModal: React.FC<ReactionPickerModalProps> = ({
  visible,
  onClose,
  onSelectEmoji,
  isOwn = false,
  canEdit = false,
  onReply,
  onEdit,
  onDelete,
}) => {
  const handleAction = (action?: () => void) => {
    onClose();
    if (action) {
      setTimeout(() => {
        action();
      }, 150);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/60 justify-center items-center px-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-zinc-900 border border-zinc-800 rounded-3xl p-3 shadow-2xl w-full max-w-[320px]"
        >
          <View className="flex-row items-center justify-between px-1">
            {POPULAR_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                onPress={() => {
                  Vibration.vibrate(50);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onSelectEmoji(emoji);
                  onClose();
                }}
                className="w-10 h-10 rounded-2xl bg-zinc-800/80 items-center justify-center active:scale-125"
                activeOpacity={0.7}
              >
                <Text className="text-2xl">{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="h-[1px] bg-zinc-800 my-2.5 w-full" />

          <View className="flex-col gap-1">
            <TouchableOpacity
              onPress={() => handleAction(onReply)}
              activeOpacity={0.7}
              className="flex-row items-center gap-3 py-2 px-3 rounded-xl active:bg-zinc-800"
            >
              <Ionicons name="arrow-undo-outline" size={20} color="#3B82F6" />
              <Text className="text-white text-sm font-medium">Відповісти</Text>
            </TouchableOpacity>

            {isOwn && canEdit && (
              <TouchableOpacity
                onPress={() => handleAction(onEdit)}
                activeOpacity={0.7}
                className="flex-row items-center gap-3 py-2 px-3 rounded-xl active:bg-zinc-800"
              >
                <Ionicons name="pencil-outline" size={20} color="#38BDF8" />
                <Text className="text-white text-sm font-medium">Редагувати</Text>
              </TouchableOpacity>
            )}

            {isOwn && (
              <TouchableOpacity
                onPress={() => handleAction(onDelete)}
                activeOpacity={0.7}
                className="flex-row items-center gap-3 py-2 px-3 rounded-xl active:bg-zinc-800"
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text className="text-red-400 text-sm font-medium">Видалити</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};