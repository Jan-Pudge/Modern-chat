import { useAuthActions } from "@convex-dev/auth/react";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../constants/theme";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { signIn } = useAuthActions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const processedCodesRef = useRef<Set<string>>(new Set());
  const isSubmittingCodeRef = useRef(false);

  const submitAuthCode = async (code: string) => {
    if (!code) return;
    if (processedCodesRef.current.has(code) || isSubmittingCodeRef.current) {
      return;
    }
    processedCodesRef.current.add(code);
    isSubmittingCodeRef.current = true;
    setIsGoogleLoading(true);

    try {
      await signIn("google", { code });
    } catch (err: any) {
      console.error("signIn('google') error:", err?.message || err);
      Alert.alert(
        "Помилка входу",
        "Не вдалося виконати вхід через Google. Спробуйте ще раз."
      );
    } finally {
      setIsGoogleLoading(false);
      isSubmittingCodeRef.current = false;
    }
  };

  useEffect(() => {
    const handleUrl = (urlStr: string | null) => {
      if (!urlStr || !urlStr.includes("code=")) return;
      const parsed = Linking.parse(urlStr);
      let code = parsed.queryParams?.code;
      if (Array.isArray(code)) code = code[0];

      if (!code && urlStr.includes("code=")) {
        const match = urlStr.match(/[?&]code=([^&]+)/);
        if (match) code = decodeURIComponent(match[1]);
      }

      if (code) {
        submitAuthCode(code as string);
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Помилка", "Будь ласка, заповніть усі поля.");
      return;
    }

    if (isSignUp && !name.trim()) {
      Alert.alert("Помилка", "Будь ласка, вкажіть ваше ім'я.");
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        await signIn("password", {
          email: email.trim(),
          password: password.trim(),
          name: name.trim(),
          flow: "signUp",
        });
        Alert.alert("Успіх", "Акаунт створено!");
      } else {
        await signIn("password", {
          email: email.trim(),
          password: password.trim(),
          flow: "signIn",
        });
      }
    } catch (err) {
      console.error("Auth Error", err);
      Alert.alert(
        "Помилка",
        isSignUp
          ? "Не вдалося зареєструватися. Можливо, пошта вже зайнята."
          : "Неправильний email або пароль."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);

      const redirectTo = Linking.createURL("");
      const { redirect } = await signIn("google", { redirectTo });
      if (!redirect) {
        setIsGoogleLoading(false);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(
        redirect.toString(),
        redirectTo
      );

      if (result.type === "success" && result.url) {
        const parsed = Linking.parse(result.url);
        let code = parsed.queryParams?.code;
        if (Array.isArray(code)) code = code[0];

        if (!code && result.url.includes("code=")) {
          const match = result.url.match(/[?&]code=([^&]+)/);
          if (match) code = decodeURIComponent(match[1]);
        }

        if (code) {
          await submitAuthCode(code as string);
        }
      }
    } catch (error) {
      console.error("Google Auth Error:", error);
      Alert.alert(
        "Помилка входу",
        "Не вдалося виконати авторизацію через Google. Спробуйте ще раз."
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-surface"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mt-14">
          <View className="w-20 h-20 rounded-3xl bg-primary/20 items-center justify-center border border-primary/30 shadow-lg shadow-primary/20">
            <Ionicons name="chatbubbles" size={38} color={COLORS.primary} />
          </View>
          <Text className="text-3xl font-bold text-white mt-4 tracking-tight">
            Modern Chat
          </Text>
          <Text className="text-sm text-textMuted mt-1.5 text-center px-6">
            {isSignUp
              ? "Створіть акаунт для спілкування в кімнатах"
              : "Увійдіть, щоб продовжити спілкування"}
          </Text>
        </View>

        <View className="px-6 mt-8 w-full items-center gap-3.5">
          {isSignUp && (
            <View className="flex-row items-center bg-secondary border border-surfaceLight rounded-2xl px-4 w-full max-w-sm">
              <Ionicons
                name="person-outline"
                size={20}
                color={COLORS.textMuted}
                style={{ marginRight: 12 }}
              />
              <TextInput
                className="flex-1 py-3.5 text-base text-white"
                placeholder="Ваше ім'я"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View className="flex-row items-center bg-secondary border border-surfaceLight rounded-2xl px-4 w-full max-w-sm">
            <Ionicons
              name="mail-outline"
              size={20}
              color={COLORS.textMuted}
              style={{ marginRight: 12 }}
            />
            <TextInput
              className="flex-1 py-3.5 text-base text-white"
              placeholder="Email"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View className="flex-row items-center bg-secondary border border-surfaceLight rounded-2xl px-4 w-full max-w-sm">
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={COLORS.textMuted}
              style={{ marginRight: 12 }}
            />
            <TextInput
              className="flex-1 py-3.5 text-base text-white"
              placeholder="Пароль"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            className={`flex-row items-center justify-center bg-primary rounded-2xl py-4 w-full max-w-sm mt-1 active:bg-primaryDark ${
              isLoading ? "opacity-60" : ""
            }`}
            activeOpacity={0.85}
            onPress={handleAuth}
            disabled={isLoading || isGoogleLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text className="text-white text-base font-bold">
                {isSignUp ? "Зареєструватися" : "Увійти"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            className="py-1"
          >
            <Text className="text-primary text-sm font-medium">
              {isSignUp
                ? "Вже є акаунт? Увійти"
                : "Немає акаунту? Створити новий"}
            </Text>
          </TouchableOpacity>

          <View className="flex-row items-center my-3 w-full max-w-sm">
            <View className="flex-1 h-[1px] bg-surfaceLight" />
            <Text className="mx-4 text-xs font-semibold text-textMuted uppercase tracking-wider">
              або
            </Text>
            <View className="flex-1 h-[1px] bg-surfaceLight" />
          </View>

          <TouchableOpacity
            className={`flex-row items-center justify-center bg-white rounded-2xl py-3.5 w-full max-w-sm active:bg-gray-100 shadow-sm ${
              isGoogleLoading ? "opacity-70" : ""
            }`}
            activeOpacity={0.85}
            onPress={handleGoogleSignIn}
            disabled={isGoogleLoading || isLoading}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <>
                <Ionicons
                  name="logo-google"
                  size={20}
                  color="#EA4335"
                  style={{ marginRight: 10 }}
                />
                <Text className="text-gray-900 text-base font-semibold">
                  Продовжити з Google
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}