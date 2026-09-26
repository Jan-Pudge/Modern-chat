import { useMutation, useQuery } from "convex/react";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

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