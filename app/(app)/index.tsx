import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SwipeableRoomItem } from "../../components/SwipeableRoomItem";
import { COLORS } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export default function HomeScreen() {
  const router = useRouter();
  const rooms = useQuery(api.rooms.listRooms);
  const currentUser = useQuery(api.users.currentUser);
  const deleteRoom = useMutation(api.rooms.deleteRoom);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleDeleteRoom = (roomId: Id<"chatRooms">) => {
    const room = rooms?.find((r) => r._id === roomId);
    if (!room) return;

    const isCreator = room.creatorId === currentUser?._id;

    if (!isCreator) {
      Alert.alert(
        "Обмеження доступу",
        "Лише автор кімнати має право видалити її для всіх учасників.",
        [{ text: "Зрозуміло", style: "default" }]
      );
      return;
    }

    Alert.alert(
      "Видалити кімнату?",
      `Ви впевнені, що хочете видалити кімнату «${room.title}» та всі її повідомлення? Цю дію неможливо скасувати.`,
      [
        { text: "Скасувати", style: "cancel" },
        {
          text: "Видалити",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRoom({ roomId });
            } catch (error: any) {
              Alert.alert("Помилка", error?.message || "Не вдалося видалити кімнату");
            }
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <Stack.Screen
        options={{
          title: "Чат-кімнати",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.push("/profile")}
              className="mr-3 w-9 h-9 rounded-full bg-secondary border border-surfaceLight items-center justify-center"
              activeOpacity={0.8}
            >
              <Ionicons name="person" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/new-room")}
              className="w-9 h-9 rounded-full bg-primary items-center justify-center shadow-sm"
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ),
        }}
      />

      {rooms === undefined ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text className="text-textMuted text-xs mt-3">Завантаження кімнат...</Text>
        </View>
      ) : rooms.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <View className="w-16 h-16 rounded-3xl bg-secondary border border-surfaceLight items-center justify-center mb-4">
            <Ionicons name="chatbubbles-outline" size={32} color={COLORS.textMuted} />
          </View>
          <Text className="text-white text-lg font-bold text-center">Немає активних кімнат</Text>
          <Text className="text-textMuted text-sm text-center mt-1">
            Створіть першу кімнату за допомогою кнопки «+» угорі
          </Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <SwipeableRoomItem
              room={item}
              isCreator={item.creatorId === currentUser?._id}
              onPress={() => router.push(`/chat/${item._id}`)}
              onDelete={handleDeleteRoom}
            />
          )}
        />
      )}
    </View>
  );
}