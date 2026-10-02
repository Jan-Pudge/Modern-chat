import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, Vibration, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { COLORS } from "../constants/theme";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { ReactionBadges } from "./ReactionBadges";
import { ReactionPickerModal } from "./ReactionPickerModal";
import { VideoNotePlayer } from "./VideoNotePlayer";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

export interface MessageItemData {
  _id: Id<"messages">;
  senderId: Id<"users">;
  senderName: string;
  senderPhoto?: string;
  content?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioStorageId?: Id<"_storage">;
  audioDuration?: number;
  videoUrl?: string;
  videoStorageId?: Id<"_storage">;
  videoDuration?: number;
  isVideoNote?: boolean;
  isEdited?: boolean;
  replyToId?: Id<"messages">;
  replyToSender?: string;
  replyToText?: string;
  _creationTime: number;
}

interface SwipeableMessageItemProps {
  item: MessageItemData;
  isOwn: boolean;
  onReply: (message: MessageItemData) => void;
  onEdit?: (message: MessageItemData) => void;
  onDelete?: (messageId: Id<"messages">) => void;
  onImagePress?: (url: string) => void;
  onAuthorPress?: (userId: Id<"users">) => void;
}

const SWIPE_THRESHOLD = 50;

export const SwipeableMessageItem: React.FC<SwipeableMessageItemProps> = ({
  item,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  onImagePress,
  onAuthorPress,
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  // @ts-ignore
  const toggleReaction = useMutation(api.reactions.toggleReaction);

  const translateX = useSharedValue(0);

  const triggerReply = () => {
    Vibration.vibrate(50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onReply(item);
  };

  const handleSelectEmoji = async (emoji: string) => {
    try {
      Vibration.vibrate(50);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await toggleReaction({ messageId: item._id, emoji });
    } catch (error) {
      console.error("Помилка встановлення реакції:", error);
    }
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (event.translationX > 0) {
        translateX.value = Math.min(event.translationX, 80);
      }
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        runOnJS(triggerReply)();
      }
      translateX.value = withSpring(0, { damping: 16, stiffness: 200 });
    });

  const animatedBubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedIconStyle = useAnimatedStyle(() => {
    const progress = Math.min(translateX.value / SWIPE_THRESHOLD, 1);
    return {
      opacity: progress,
      transform: [{ scale: 0.5 + progress * 0.5 }],
    };
  });

  return (
    <View className="relative justify-center my-1">
      <Animated.View
        style={animatedIconStyle}
        className="absolute left-2 z-0 items-center justify-center w-8 h-8 rounded-full bg-blue-600/30"
      >
        <Ionicons name="arrow-undo" size={18} color="#3B82F6" />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={animatedBubbleStyle}
          className={`flex-row ${isOwn ? "justify-end" : "justify-start"}`}
        >
          <View className={`max-w-[82%] ${isOwn ? "items-end" : "items-start"}`}>
            <TouchableOpacity
              activeOpacity={0.9}
              onLongPress={() => {
                Vibration.vibrate(50);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowReactionPicker(true);
              }}
              delayLongPress={200}
              className={`w-full ${
                item.videoUrl && item.isVideoNote
                  ? "bg-zinc-900/60 p-2 rounded-2xl"
                  : isOwn
                  ? "bg-blue-600 rounded-2xl rounded-tr-sm p-3"
                  : "bg-zinc-800 rounded-2xl rounded-tl-sm p-3"
              }`}
            >
              {!isOwn && (
                <TouchableOpacity
                  onPress={() => onAuthorPress?.(item.senderId)}
                  activeOpacity={0.7}
                  className="mb-1 self-start"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text className="text-blue-400 font-semibold text-xs">{item.senderName}</Text>
                </TouchableOpacity>
              )}

              {item.replyToSender && (
                <View
                  className={`mb-2 p-2 rounded-lg border-l-2 ${
                    isOwn
                      ? "bg-blue-700/60 border-white/80"
                      : "bg-zinc-900/70 border-blue-500"
                  }`}
                >
                  <Text
                    className={`font-semibold text-[11px] ${
                      isOwn ? "text-white" : "text-blue-400"
                    }`}
                  >
                    {item.replyToSender}
                  </Text>
                  <Text
                    className={`text-xs mt-0.5 ${
                      isOwn ? "text-blue-100" : "text-zinc-300"
                    }`}
                    numberOfLines={2}
                  >
                    {item.replyToText || "📷 Фотографія"}
                  </Text>
                </View>
              )}

              {item.videoUrl && item.isVideoNote && (
                <View className="my-1 items-center justify-center">
                  <VideoNotePlayer
                    videoUrl={item.videoUrl}
                    duration={item.videoDuration}
                    size={210}
                  />
                </View>
              )}

              {item.imageUrl && (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onImagePress?.(item.imageUrl!)}
                  onLongPress={() => {
                    Vibration.vibrate(50);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowReactionPicker(true);
                  }}
                  delayLongPress={200}
                >
                  <Image
                    source={{ uri: item.imageUrl }}
                    className="w-56 h-56 rounded-xl mb-1.5 bg-zinc-900"
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}

              {item.audioUrl && (
                <View className="my-1">
                  <VoiceMessagePlayer
                    audioUrl={item.audioUrl}
                    duration={item.audioDuration}
                    isMyMessage={isOwn}
                  />
                </View>
              )}

              {item.content ? (
                <Text className="text-white text-base leading-5">{item.content}</Text>
              ) : null}

              <View className="flex-row items-center justify-end mt-1 gap-1">
                {item.isEdited && (
                  <Text
                    className={`text-[10px] italic ${
                      isOwn ? "text-blue-200" : "text-zinc-400"
                    }`}
                  >
                    (ред.)
                  </Text>
                )}
                <Text
                  className={`text-[11px] ${
                    isOwn ? "text-blue-200" : "text-zinc-400"
                  }`}
                >
                  {new Date(item._creationTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
                {isOwn && (
                  <Ionicons
                    name="checkmark-done"
                    size={14}
                    color="#93C5FD"
                    style={{ marginLeft: 2 }}
                  />
                )}
              </View>
            </TouchableOpacity>

            <ReactionBadges messageId={item._id} />
          </View>
        </Animated.View>
      </GestureDetector>

      <ReactionPickerModal
        visible={showReactionPicker}
        onClose={() => setShowReactionPicker(false)}
        onSelectEmoji={handleSelectEmoji}
        isOwn={isOwn}
        canEdit={Boolean(item.content)}
        onReply={() => onReply(item)}
        onEdit={() => onEdit?.(item)}
        onDelete={() => onDelete?.(item._id)}
      />
    </View>
  );
};