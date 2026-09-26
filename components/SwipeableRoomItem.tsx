import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { COLORS } from "../constants/theme";
import { Id } from "../convex/_generated/dataModel";

interface RoomData {
  _id: Id<"chatRooms">;
  title: string;
  description?: string;
  creatorId: Id<"users">;
  lastMessage?: string;
  lastMessageAt?: number;
}

interface SwipeableRoomItemProps {
  room: RoomData;
  isCreator: boolean;
  onPress: () => void;
  onDelete: (roomId: Id<"chatRooms">) => void;
}

const ACTION_WIDTH = 80;

export const SwipeableRoomItem: React.FC<SwipeableRoomItemProps> = ({
  room,
  isCreator,
  onPress,
  onDelete,
}) => {
  const translateX = useSharedValue(0);

  const resetPosition = () => {
    "worklet";
    translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
  };

  const handleDeletePress = () => {
    resetPosition();
    onDelete(room._id);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (event.translationX <= 0) {
        translateX.value = Math.max(event.translationX, -ACTION_WIDTH - 20);
      } else {
        translateX.value = event.translationX * 0.15;
      }
    })
    .onEnd((event) => {
      if (event.translationX < -ACTION_WIDTH / 2) {
        translateX.value = withSpring(-ACTION_WIDTH, { damping: 18, stiffness: 180 });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedIconStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / ACTION_WIDTH, 1);
    return {
      opacity: progress,
      transform: [{ scale: 0.6 + 0.4 * progress }],
    };
  });

  return (
    <View className="relative overflow-hidden rounded-2xl mb-3">
      <View className="absolute inset-0 bg-red-600 rounded-2xl flex-row justify-end items-center pr-5">
        <TouchableOpacity
          onPress={handleDeletePress}
          activeOpacity={0.8}
          className="items-center justify-center h-full px-2"
        >
          <Animated.View style={animatedIconStyle} className="items-center">
            <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
            <Text className="text-white text-[11px] font-bold mt-1">
              {isCreator ? "Видалити" : "Закрити"}
            </Text>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedCardStyle}>
          <TouchableOpacity
            onPress={() => {
              if (translateX.value !== 0) {
                resetPosition();
              } else {
                onPress();
              }
            }}
            activeOpacity={0.9}
            className="bg-secondary border border-surfaceLight rounded-2xl p-4 flex-row items-center justify-between"
          >
            <View className="flex-row items-center flex-1 mr-3">
              <View className="w-12 h-12 rounded-xl bg-surfaceLight items-center justify-center mr-3.5">
                <Ionicons name="chatbubbles" size={22} color={COLORS.primary} />
              </View>

              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-white text-base font-bold flex-shrink" numberOfLines={1}>
                    {room.title}
                  </Text>
                  {isCreator && (
                    <View className="bg-primary/20 px-1.5 py-0.5 rounded">
                      <Text className="text-primary text-[10px] font-semibold">автор</Text>
                    </View>
                  )}
                </View>

                {room.lastMessage ? (
                  <Text className="text-textMuted text-xs mt-1" numberOfLines={1}>
                    {room.lastMessage}
                  </Text>
                ) : (
                  <Text className="text-textMuted/60 text-xs italic mt-1" numberOfLines={1}>
                    {room.description || "Повідомлень ще немає"}
                  </Text>
                )}
              </View>
            </View>

            <View className="items-end">
              {room.lastMessageAt ? (
                <Text className="text-textMuted text-[10px] mb-1">
                  {new Date(room.lastMessageAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};