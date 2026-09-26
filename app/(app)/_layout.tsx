import { Stack } from "expo-router";
import { COLORS } from "../../constants/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: "bold" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.surface },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Чат-кімнати",
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="new-room"
        options={{
          presentation: "modal",
          title: "Нова кімната",
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          presentation: "modal",
          title: "Профіль",
        }}
      />
      <Stack.Screen
        name="chat/[id]"
        options={{
          title: "Чат",
          headerBackTitle: "Назад",
        }}
      />
      <Stack.Screen
        name="settings/[id]"
        options={{
          presentation: "modal",
          title: "Інформація про кімнату",
        }}
      />
      <Stack.Screen
        name="user/[id]"
        options={{
          title: "Профіль учасника",
          headerBackTitle: "Назад",
        }}
      />
    </Stack>
  );
}