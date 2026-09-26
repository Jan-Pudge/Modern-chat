import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
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