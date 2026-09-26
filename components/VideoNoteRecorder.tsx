import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
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

    if (!cameraRef.current || isRecording) return;

    try {
      setIsRecording(true);
      setRecordSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 59) {
            handleStopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

      const videoRecordPromise = cameraRef.current.recordAsync({
        maxDuration: 60,
      });

      const video = await videoRecordPromise;

      if (video?.uri) {
        setIsProcessing(true);
        await onSendVideo(video.uri, recordSeconds || 1);
        setIsProcessing(false);
        handleClose();
      }
    } catch (error) {
      console.error("Помилка запису відео:", error);
      Alert.alert("Помилка", "Не вдалося записати відео");
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const handleStopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
    }
  };

  const handleClose = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordSeconds(0);
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
            disabled={isRecording || isProcessing}
            onPress={() => setCameraFacing((prev) => (prev === "front" ? "back" : "front"))}
            className="w-12 h-12 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
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
    </Modal>
  );
};