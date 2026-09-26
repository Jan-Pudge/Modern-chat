import { useMutation } from "convex/react";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { api } from "../convex/_generated/api";
import { ReactionBadges } from "./ReactionBadges";
import { ReactionPickerModal } from "./ReactionPickerModal";
import { VideoNotePlayer } from "./VideoNotePlayer";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

interface MessageBubbleProps {
  message: any;
  isMyMessage: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMyMessage,
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const toggleReaction = useMutation(api.reactions.toggleReaction as any);

  const handleSelectEmoji = async (emoji: string) => {
    try {
      await toggleReaction({ messageId: message._id, emoji });
    } catch (error) {
      console.error("Помилка реакції:", error);
    }
  };

  return (
    <View className={`my-1 max-w-[80%] ${isMyMessage ? "self-end" : "self-start"}`}>
      {message.videoUrl && message.isVideoNote ? (
        <TouchableOpacity
          onLongPress={() => setShowReactionPicker(true)}
          activeOpacity={0.9}
          className="items-center justify-center p-1"
        >
          <VideoNotePlayer
            videoUrl={message.videoUrl}
            duration={message.videoDuration}
            size={210}
          />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onLongPress={() => setShowReactionPicker(true)}
          activeOpacity={0.9}
          className={`p-3 rounded-2xl ${
            isMyMessage
              ? "bg-primary rounded-br-none"
              : "bg-surfaceLight rounded-bl-none"
          }`}
        >
          {!isMyMessage && message.senderName && (
            <Text className="text-xs font-semibold text-primary mb-1">
              {message.senderName}
            </Text>
          )}

          {Boolean(message.content) && (
            <Text
              className={`text-base ${
                isMyMessage ? "text-white" : "text-white/90"
              }`}
            >
              {message.content}
            </Text>
          )}

          {Boolean(message.audioUrl) && (
            <View className="my-1">
              <VoiceMessagePlayer
                audioUrl={message.audioUrl}
                duration={message.audioDuration}
                isMyMessage={isMyMessage}
              />
            </View>
          )}

          {Boolean(message.imageUrl) && (
            <Image
              source={{ uri: message.imageUrl }}
              className="w-48 h-48 rounded-xl mt-1"
              resizeMode="cover"
            />
          )}
        </TouchableOpacity>
      )}

      <ReactionBadges messageId={message._id} />

      <ReactionPickerModal
        visible={showReactionPicker}
        onClose={() => setShowReactionPicker(false)}
        onSelectEmoji={handleSelectEmoji}
      />
    </View>
  );
};