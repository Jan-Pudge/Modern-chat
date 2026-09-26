import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../constants/theme";

interface VoiceMessagePlayerProps {
  audioUrl: string;
  duration?: number;
  isMyMessage?: boolean;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  audioUrl,
  duration = 0,
  isMyMessage = false,
}) => {
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);

  const togglePlayPause = () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const effectiveDuration = status.duration > 0 ? status.duration : duration;
  const progress = effectiveDuration > 0 ? status.currentTime / effectiveDuration : 0;

  return (
    <View className="flex-row items-center gap-3 py-1 px-1 min-w-[210px]">
      <TouchableOpacity
        onPress={togglePlayPause}
        className={`w-10 h-10 rounded-full items-center justify-center active:opacity-80 ${
          isMyMessage ? "bg-white" : "bg-primary"
        }`}
      >
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={20}
          color={isMyMessage ? COLORS.primary : "#FFFFFF"}
          style={{ marginLeft: status.playing ? 0 : 2 }}
        />
      </TouchableOpacity>

      <View className="flex-1 justify-center">
        <View
          className={`h-1.5 rounded-full overflow-hidden mb-1.5 ${
            isMyMessage ? "bg-white/30" : "bg-surfaceLight"
          }`}
        >
          <View
            className={`h-full rounded-full ${
              isMyMessage ? "bg-white" : "bg-primary"
            }`}
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </View>

        <View className="flex-row justify-between items-center">
          <Text
            className={`text-xs ${
              isMyMessage ? "text-white/80" : "text-grey"
            }`}
          >
            {formatTime(status.currentTime || 0)}
          </Text>
          <Text
            className={`text-xs ${
              isMyMessage ? "text-white/80" : "text-grey"
            }`}
          >
            {formatTime(effectiveDuration)}
          </Text>
        </View>
      </View>

      <Ionicons
        name="mic"
        size={16}
        color={isMyMessage ? "rgba(255,255,255,0.7)" : COLORS.primary}
      />
    </View>
  );
};