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
            Відповідь для {replyTarget.senderName}
          </Text>
          <Text className="text-zinc-300 text-xs mt-0.5" numberOfLines={1}>
            {replyTarget.text || "📷 Зображення"}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onCancel}
        className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center active:opacity-70"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="close" size={16} color="#A1A1AA" />
      </TouchableOpacity>
    </View>
  );
};