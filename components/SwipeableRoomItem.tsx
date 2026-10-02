import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import { Text, TouchableOpacity, Vibration, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
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

const ACTION_WIDTH = 95;

export const SwipeableRoomItem: React.FC<SwipeableRoomItemProps> = ({
  room,
  isCreator,
  onPress,
  onDelete,
}) => {
  const translateX = useSharedValue(0);
  const holdProgress = useSharedValue(0);
  const [isHolding, setIsHolding] = useState(false);
  const isConfirmedRef = useRef(false);
  const isOpen = useSharedValue(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetPosition = () => {
    "worklet";
    translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
  };

  const confirmDelete = () => {
    isConfirmedRef.current = true;
    Vibration.vibrate(50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsHolding(false);
    translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
    isOpen.value = false;
    onDelete(room._id);
  };

  const handlePressIn = () => {
    isConfirmedRef.current = false;
    setIsHolding(true);
    Vibration.vibrate(50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    holdProgress.value = 0;
    holdProgress.value = withTiming(1, { duration: 1200, easing: Easing.linear });

    timerRef.current = setTimeout(() => {
      if (!isConfirmedRef.current) {
        confirmDelete();
      }
    }, 1200);
  };

  const handlePressOut = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isConfirmedRef.current) {
      setIsHolding(false);
      holdProgress.value = withTiming(0, { duration: 200 });
    }
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
        isOpen.value = true;
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        isOpen.value = false;
      }
    });

  const animatedCardStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const animatedDeleteButtonStyle = useAnimatedStyle(() => {
    "worklet";
    const progress = Math.min(Math.abs(translateX.value) / ACTION_WIDTH, 1);
    const scale = (0.6 + 0.4 * progress) * (1 + holdProgress.value * 0.25);
    return {
      opacity: progress,
      transform: [{ scale }],
    };
  });

  const animatedProgressStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      width: `${Math.min(Math.max(holdProgress.value, 0), 1) * 100}%`,
    };
  });

  return (
    <View className="relative overflow-hidden border-b border-zinc-900 bg-zinc-950">
      <View className="absolute inset-0 bg-red-700 flex-row justify-end items-center pr-3">
        <TouchableOpacity
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
          className="items-center justify-center h-full px-2 min-w-[85px]"
        >
          <Animated.View style={animatedDeleteButtonStyle} className="items-center">
            <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
            <Text className="text-white text-[10px] font-bold mt-1 text-center">
              {isHolding ? "Тримайте..." : isCreator ? "Затисніть 1.2с" : "Закрити 1.2с"}
            </Text>
            {/* Animated progress bar */}
            <View className="w-16 h-1.5 bg-black/40 rounded-full mt-1.5 overflow-hidden">
              <Animated.View
                style={animatedProgressStyle}
                className="h-full bg-white rounded-full"
              />
            </View>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedCardStyle}>
          <TouchableOpacity
            onPress={() => {
              if (isOpen.value) {
                translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
                isOpen.value = false;
              } else {
                onPress();
              }
            }}
            activeOpacity={0.7}
            className="bg-zinc-950 active:bg-zinc-900/60 px-4 py-3 flex-row items-center justify-between"
          >
            <View className="flex-row items-center flex-1 mr-3">
              <View className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500/30 items-center justify-center mr-3.5 flex-shrink-0">
                <Text className="text-blue-400 font-bold text-base">
                  {room.title ? room.title[0]?.toUpperCase() : "C"}
                </Text>
              </View>

              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-white text-base font-semibold flex-shrink" numberOfLines={1}>
                    {room.title}
                  </Text>
                  {isCreator && (
                    <View className="bg-blue-950/80 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                      <Text className="text-blue-400 text-[10px] font-semibold">автор</Text>
                    </View>
                  )}
                </View>

                {room.lastMessage ? (
                  <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={1}>
                    {room.lastMessage}
                  </Text>
                ) : (
                  <Text className="text-zinc-500 text-sm italic mt-0.5" numberOfLines={1}>
                    {room.description || "Повідомлень ще немає"}
                  </Text>
                )}
              </View>
            </View>

            <View className="items-end justify-center">
              {room.lastMessageAt ? (
                <Text className="text-zinc-500 text-xs mb-1">
                  {new Date(room.lastMessageAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color="#71717A" />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};