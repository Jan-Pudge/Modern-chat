import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../constants/theme";

export interface ReplyTarget {
  messageId: string;
  senderName: string;
  text: string;
}

interface ReplyPreviewBarProps {
  replyTarget: ReplyTarget;
  onCancel: () => void;
}

export const ReplyPreviewBar: React.FC<ReplyPreviewBarProps> = ({
  replyTarget,
  onCancel,
}) => {
  return (
    <View className="flex-row items-center justify-between px-4 py-2 bg-surfaceLight/95 border-t border-surface border-l-4 border-l-primary">
      <View className="flex-row items-center flex-1 mr-2">
        <Ionicons
          name="arrow-undo"
          size={18}
          color={COLORS.primary}
          style={{ marginRight: 8 }}
        />
        <View className="flex-1">
          <Text className="text-primary font-bold text-xs">
            Відповідь для {replyTarget.senderName}
          </Text>
          <Text className="text-white/80 text-xs mt-0.5" numberOfLines={1}>
            {replyTarget.text || "📷 Зображення"}
          </Text>
        </View>
      </View>

      <TouchableOpacity onPress={onCancel} className="p-1">
        <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
};