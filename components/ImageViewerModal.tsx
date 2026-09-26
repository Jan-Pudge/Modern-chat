import { Ionicons } from "@expo/vector-icons";
import { Image, Modal, SafeAreaView, TouchableOpacity } from "react-native";
type Props = {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
};

export function ImageViewerModal({ visible, imageUrl, onClose }: Props) {
  if (!imageUrl) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-black justify-center items-center relative">
        <TouchableOpacity
          onPress={onClose}
          className="absolute top-12 right-6 z-20 w-10 h-10 rounded-full bg-surface/80 items-center justify-center"
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Image
          source={{ uri: imageUrl }}
          className="w-full h-4/5"
          resizeMode="contain"
        />
      </SafeAreaView>
    </Modal>
  );
}