import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { COLORS } from "../constants/theme";

type VideoNotePlayerProps = {
  videoUrl: string;
  duration?: number;
  size?: number;
};

export const VideoNotePlayer = ({
  videoUrl,
  duration = 0,
  size = 200,
}: VideoNotePlayerProps) => {
  const [isMuted, setIsMuted] = useState(true);
  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = isMuted;
    p.play();
  });

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (player) {
      player.muted = nextMute;
    }
  };

  const currentProgress =
    duration > 0 && player?.currentTime
      ? Math.min(1, player.currentTime / duration)
      : 0;
  const strokeDashoffset = circumference - currentProgress * circumference;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={toggleMute}
      style={{ width: size, height: size }}
      className="relative items-center justify-center"
    >
      <View
        style={{ width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }}
        className="overflow-hidden bg-surfaceLight items-center justify-center"
      >
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          nativeControls={false}
        />
      </View>

      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.primary}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      <View className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded-full flex-row items-center gap-1">
        <Ionicons
          name={isMuted ? "volume-mute" : "volume-high"}
          size={12}
          color="#FFFFFF"
        />
        {duration > 0 && (
          <Text className="text-[10px] text-white font-mono">
            {Math.round(duration)}s
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};