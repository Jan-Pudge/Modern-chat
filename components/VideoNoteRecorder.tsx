import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { COLORS } from "../constants/theme";

type VideoNoteRecorderProps = {
  visible: boolean;
  onClose: () => void;
  onSendVideo: (videoUri: string, duration: number) => Promise<void>;
};

export const VideoNoteRecorder = ({
  visible,
  onClose,
  onSendVideo,
}: VideoNoteRecorderProps) => {
  const [cameraFacing, setCameraFacing] = useState<CameraType>("front");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const isFlippingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const recordSecondsRef = useRef(0);

  const toggleCameraFacing = () => {
    if (isProcessing) return;
    Vibration.vibrate(50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (isRecordingRef.current) {
      isFlippingRef.current = true;
    }
    setCameraFacing((prev) => (prev === "front" ? "back" : "front"));
  };

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .enabled(!isProcessing)
    .onEnd(() => {
      runOnJS(toggleCameraFacing)();
    });

  const handleStartRecording = async () => {
    if (!cameraPermission?.granted) {
      const cam = await requestCameraPermission();
      if (!cam.granted) {
        Alert.alert("Помилка", "Дозвольте доступ до камери для запису кружечка");
        return;
      }
    }

    if (!micPermission?.granted) {
      const mic = await requestMicPermission();
      if (!mic.granted) {
        Alert.alert("Помилка", "Дозвольте доступ до мікрофона для запису звуку");
        return;
      }
    }

    if (!cameraRef.current || isRecordingRef.current) return;

    try {
      Vibration.vibrate(50);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      isFlippingRef.current = false;

      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          recordSecondsRef.current = next;
          if (next >= 59) {
            handleStopRecording();
            return 60;
          }
          return next;
        });
      }, 1000);

      const recordLoop = async () => {
        let finalVideo = null;
        while (isRecordingRef.current) {
          isFlippingRef.current = false;
          try {
            const video = await cameraRef.current?.recordAsync({
              maxDuration: 60,
            });

            if (isFlippingRef.current) {
              isFlippingRef.current = false;
            } else {
              finalVideo = video;
              break;
            }
          } catch {
            break;
          }
        }
        return finalVideo;
      };

      const video = await recordLoop();

      if (video?.uri && !isFlippingRef.current) {
        setIsProcessing(true);
        try {
          const durationToSend = Math.max(1, recordSecondsRef.current);
          await onSendVideo(video.uri, durationToSend);
          handleClose();
        } catch (sendError) {
          console.error("Помилка передачі відео:", sendError);
        } finally {
          setIsProcessing(false);
        }
      }
    } catch (error) {
      console.error("Помилка запису відео:", error);
      Alert.alert("Помилка", "Не вдалося записати відео");
      isRecordingRef.current = false;
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const handleStopRecording = () => {
    Vibration.vibrate(50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (cameraRef.current && isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      try {
        cameraRef.current.stopRecording();
      } catch {}
    }
  };

  const handleClose = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (cameraRef.current && isRecordingRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch (e) {}
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    setRecordSeconds(0);
    recordSecondsRef.current = 0;
    setIsProcessing(false);
    onClose();
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${mins}:${remaining < 10 ? "0" : ""}${remaining}`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <GestureDetector gesture={doubleTapGesture}>
        <View className="flex-1 bg-black/90 justify-center items-center px-4">
          <TouchableOpacity
            onPress={handleClose}
            disabled={isRecording || isProcessing}
            className="absolute top-12 right-6 p-2 rounded-full bg-white/10"
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <View className="mb-6 items-center">
            <View className="flex-row items-center bg-black/60 px-4 py-1.5 rounded-full border border-white/20">
              {isRecording && <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2 animate-pulse" />}
              <Text className="text-white font-mono text-base">
                {formatSeconds(recordSeconds)} / 1:00
              </Text>
            </View>
          </View>

          <View className="w-72 h-72 rounded-full overflow-hidden border-4 border-primary items-center justify-center bg-surface relative">
            <CameraView
              ref={cameraRef}
              style={{ width: "100%", height: "100%" }}
              facing={cameraFacing}
              mode="video"
            />

            {isProcessing && (
              <View className="absolute inset-0 bg-black/70 items-center justify-center">
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text className="text-white text-xs font-semibold mt-2">Обробка відео...</Text>
              </View>
            )}
          </View>

        <View className="flex-row items-center justify-center gap-8 mt-10">
          <TouchableOpacity
            disabled={isProcessing}
            onPress={toggleCameraFacing}
            className={`w-12 h-12 rounded-full items-center justify-center ${
              isProcessing ? "bg-white/5 opacity-40" : "bg-white/10 active:bg-white/20"
            }`}
          >
            <Ionicons name="camera-reverse-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isRecording ? handleStopRecording : handleStartRecording}
            disabled={isProcessing}
            activeOpacity={0.8}
            className={`w-20 h-20 rounded-full items-center justify-center border-4 ${
              isRecording ? "border-red-500 bg-red-500/30" : "border-white bg-primary"
            }`}
          >
            <Ionicons
              name={isRecording ? "stop" : "radio-button-on"}
              size={36}
              color={isRecording ? "#EF4444" : "#FFFFFF"}
            />
          </TouchableOpacity>

          <View className="w-12 h-12" />
        </View>
        </View>
      </GestureDetector>
    </Modal>
  );
};