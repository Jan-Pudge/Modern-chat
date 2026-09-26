import { useAuthActions } from "@convex-dev/auth/react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { EditProfileModal } from "../../components/EditProfileModal";
import { COLORS } from "../../constants/theme";
import { api } from "../../convex/_generated/api";

export default function ProfileScreen() {
  const router = useRouter();
  const currentUser = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const profileDetails = useQuery(
    api.users.getUserProfile,
    currentUser?._id ? { userId: currentUser._id } : "skip"
  );

  const handleSignOut = () => {
    Alert.alert("Вихід з акаунта", "Ви дійсно бажаєте вийти з Modern Chat?", [
      { text: "Скасувати", style: "cancel" },
      {
        text: "Вийти",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  if (currentUser === undefined || profileDetails === undefined) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20 }}>
      <View className="items-center mt-4 mb-6">
        <View className="w-28 h-28 rounded-full bg-secondary border-4 border-primary/40 items-center justify-center overflow-hidden mb-3 shadow-lg">
          {currentUser?.image ? (
            <Image source={{ uri: currentUser.image }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <Ionicons name="person" size={54} color={COLORS.primary} />
          )}
        </View>

        <Text className="text-white text-2xl font-bold">{currentUser?.name ?? "Користувач"}</Text>

        {currentUser?.username && (
          <Text className="text-primary text-sm font-semibold mt-0.5">
            @{currentUser.username}
          </Text>
        )}

        <Text className="text-textMuted text-xs mt-1">{currentUser?.email}</Text>

        {currentUser?.bio ? (
          <View className="mt-3 px-4 py-2 bg-secondary rounded-xl border border-surfaceLight max-w-[90%]">
            <Text className="text-white/90 text-sm text-center italic">{currentUser.bio}</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row gap-3 mb-6">
        <View className="flex-1 bg-secondary border border-surfaceLight rounded-2xl p-4 items-center">
          <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center mb-2">
            <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primary} />
          </View>
          <Text className="text-white text-xl font-bold">
            {profileDetails?.stats.messagesCount ?? 0}
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">Повідомлень</Text>
        </View>

        <View className="flex-1 bg-secondary border border-surfaceLight rounded-2xl p-4 items-center">
          <View className="w-10 h-10 rounded-full bg-purple-500/20 items-center justify-center mb-2">
            <Ionicons name="folder" size={20} color="#A855F7" />
          </View>
          <Text className="text-white text-xl font-bold">
            {profileDetails?.stats.roomsCreatedCount ?? 0}
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">Створено кімнат</Text>
        </View>
      </View>

      <View className="gap-3">
        <TouchableOpacity
          onPress={() => setIsEditModalOpen(true)}
          className="flex-row items-center justify-center bg-primary rounded-2xl py-3.5 px-4 active:opacity-80"
        >
          <Ionicons name="create-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text className="text-white font-bold text-base">Редагувати профіль</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSignOut}
          className="flex-row items-center justify-center bg-red-600/10 border border-red-500/30 rounded-2xl py-3.5 px-4 active:opacity-80"
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} style={{ marginRight: 8 }} />
          <Text className="text-red-500 font-bold text-base">Вийти з акаунта</Text>
        </TouchableOpacity>
      </View>

      <EditProfileModal
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        currentUser={currentUser}
      />
    </ScrollView>
  );
}