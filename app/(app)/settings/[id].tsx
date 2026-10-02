import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../constants/theme";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

export default function RoomSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const room = useQuery(api.rooms.getRoom, {
    roomId: id as Id<"chatRooms">,
  });
  const currentUser = useQuery(api.users.currentUser);
  const deleteRoom = useMutation(api.rooms.deleteRoom);
  const toggleMuteRoom = useMutation(api.rooms.toggleMuteRoom);

  const handleToggleMute = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await toggleMuteRoom({ roomId: id as Id<"chatRooms"> });
    } catch (err) {
      console.error(err);
      Alert.alert("Помилка", "Не вдалося змінити налаштування сповіщень.");
    }
  };

  const isCreator = room && currentUser && room.creatorId === currentUser._id;

  const handleDelete = () => {
    Alert.alert(
      "Видалення кімнати",
      "Ви впевнені, що хочете видалити цю кімнату та всі її повідомлення?",
      [
        { text: "Скасувати", style: "cancel" },
        {
          text: "Видалити",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRoom({ roomId: id as Id<"chatRooms"> });
              router.dismissAll();
              router.replace("/(app)");
            } catch (err) {
              console.error(err);
              Alert.alert("Помилка", "Не вдалося видалити кімнату.");
            }
          },
        },
      ]
    );
  };

  if (!room) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface p-6">
      <View className="bg-secondary border border-surfaceLight rounded-2xl p-5 mb-6">
        <Text className="text-textMuted text-xs font-semibold uppercase mb-1">
          Назва
        </Text>
        <Text className="text-white text-xl font-bold">{room.title}</Text>

        {room.description ? (
          <>
            <Text className="text-textMuted text-xs font-semibold uppercase mt-4 mb-1">
              Опис
            </Text>
            <Text className="text-neutral-300 text-sm">{room.description}</Text>
          </>
        ) : null}
      </View>

      <View className="bg-secondary border border-surfaceLight rounded-2xl p-4 mb-6 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-3">
          <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${room.isMuted ? "bg-red-500/20 border border-red-500/30" : "bg-blue-600/20 border border-blue-500/30"}`}>
            <Ionicons
              name={room.isMuted ? "notifications-off" : "notifications"}
              size={20}
              color={room.isMuted ? "#EF4444" : "#3B82F6"}
            />
          </View>
          <View className="flex-1">
            <Text className="text-white text-base font-semibold">Сповіщення</Text>
            <Text className="text-neutral-400 text-xs mt-0.5">
              {room.isMuted ? "Вимкнено для цього чату" : "Увімкнено для цього чату"}
            </Text>
          </View>
        </View>
        <Switch
          value={!room.isMuted}
          onValueChange={handleToggleMute}
          trackColor={{ false: "#3F3F46", true: "#2563EB" }}
          thumbColor="#FFFFFF"
        />
      </View>

      {isCreator && (
        <TouchableOpacity
          onPress={handleDelete}
          className="bg-danger/20 border border-danger/30 rounded-2xl py-4 flex-row items-center justify-center active:bg-danger/30"
          activeOpacity={0.8}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color={COLORS.danger}
            style={{ marginRight: 8 }}
          />
          <Text className="text-danger text-base font-bold">
            Видалити кімнату
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}