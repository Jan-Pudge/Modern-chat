import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../constants/theme";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const userId = id as Id<"users">;
  const userProfile = useQuery(api.users.getUserProfile, { userId });
  const currentUser = useQuery(api.users.currentUser);

  const isOwnProfile = currentUser?._id === userId;

  if (userProfile === undefined) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (userProfile === null) {
    return (
      <View className="flex-1 bg-surface justify-center items-center p-6">
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
        <Text className="text-white text-lg font-bold mt-3">Користувача не знайдено</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 bg-secondary px-5 py-2.5 rounded-xl border border-surfaceLight"
        >
          <Text className="text-white font-medium">Повернутися</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20 }}>
      <Stack.Screen
        options={{
          title: userProfile.name,
          headerBackTitle: "Назад",
        }}
      />

      <View className="items-center mt-4 mb-6">
        <View className="w-28 h-28 rounded-full bg-secondary border-4 border-primary/40 items-center justify-center overflow-hidden mb-3 shadow-lg">
          {userProfile.image ? (
            <Image source={{ uri: userProfile.image }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <Ionicons name="person" size={54} color={COLORS.primary} />
          )}
        </View>

        <Text className="text-white text-2xl font-bold">{userProfile.name}</Text>

        {userProfile.username && (
          <Text className="text-primary text-sm font-semibold mt-0.5">
            @{userProfile.username}
          </Text>
        )}

        {isOwnProfile && (
          <View className="bg-primary/20 px-2 py-0.5 rounded-full mt-2">
            <Text className="text-primary text-xs font-semibold">Це ваш акаунт</Text>
          </View>
        )}

        {userProfile.bio ? (
          <View className="mt-4 px-4 py-3 bg-secondary rounded-2xl border border-surfaceLight w-full">
            <Text className="text-textMuted text-xs font-semibold uppercase mb-1">Статус</Text>
            <Text className="text-white text-sm leading-5">{userProfile.bio}</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row gap-3 mb-6">
        <View className="flex-1 bg-secondary border border-surfaceLight rounded-2xl p-4 items-center">
          <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center mb-2">
            <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primary} />
          </View>
          <Text className="text-white text-xl font-bold">
            {userProfile.stats.messagesCount}
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">Повідомлень</Text>
        </View>

        <View className="flex-1 bg-secondary border border-surfaceLight rounded-2xl p-4 items-center">
          <View className="w-10 h-10 rounded-full bg-purple-500/20 items-center justify-center mb-2">
            <Ionicons name="folder" size={20} color="#A855F7" />
          </View>
          <Text className="text-white text-xl font-bold">
            {userProfile.stats.roomsCreatedCount}
          </Text>
          <Text className="text-textMuted text-xs mt-0.5">Створено кімнат</Text>
        </View>
      </View>

      <View className="bg-secondary/60 border border-surfaceLight rounded-2xl p-4 flex-row items-center mb-6">
        <Ionicons name="calendar-outline" size={20} color={COLORS.textMuted} style={{ marginRight: 10 }} />
        <Text className="text-textMuted text-xs">
          Учасник з {new Date(userProfile._creationTime).toLocaleDateString()}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => router.back()}
        className="bg-secondary border border-surfaceLight rounded-2xl py-3.5 items-center justify-center active:opacity-80"
      >
        <Text className="text-white font-bold text-base">Повернутися до розмови</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}