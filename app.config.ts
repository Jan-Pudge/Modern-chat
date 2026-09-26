import fs from "fs";
import path from "path";
import { ConfigContext, ExpoConfig } from "expo/config";

const APP_NAME = "Modern Chat";
const PACKAGE_NAME = "com.modernchat.app";
const SCHEME = "modernchat";

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment =
    (process.env.APP_ENV as "development" | "preview" | "production") ||
    "development";

  console.log("⚙️  Поточне середовище збірки:", environment);
  console.log("📦 URL бази даних Convex:", process.env.EXPO_PUBLIC_CONVEX_URL);

  const isDev = environment === "development";
  const googleServicesExists = fs.existsSync(
    path.resolve(__dirname, "google-services.json")
  );

  return {
    ...config,
    name: isDev ? `${APP_NAME} Dev` : APP_NAME,
    slug: "modern-chat",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: isDev ? `${SCHEME}-dev` : SCHEME,
    userInterfaceStyle: "automatic",

    ios: {
      icon: "./assets/expo.icon",
      bundleIdentifier: isDev ? `${PACKAGE_NAME}.dev` : PACKAGE_NAME,
      infoPlist: {
        NSCameraUsageDescription:
          "Modern Chat потрібен доступ до камери для запису відеокружечків.",
        NSMicrophoneUsageDescription:
          "Modern Chat потрібен доступ до вашого мікрофона для запису голосових повідомлень та звуку у відеокружечках.",
      },
    },

    android: {
      package: isDev ? `${PACKAGE_NAME}.dev` : PACKAGE_NAME,
      ...(googleServicesExists ? { googleServicesFile: "./google-services.json" } : {}),
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.VIBRATE",
        "android.permission.POST_NOTIFICATIONS",
      ],
    },

    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission:
            "Modern Chat потрібен доступ до камери для запису відеокружечків.",
          microphonePermission:
            "Modern Chat потрібен доступ до мікрофона для запису звуку у відеокружечках.",
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission:
            "Додатку Modern Chat потрібен доступ до вашого мікрофона для запису та надсилання голосових повідомлень.",
          recordAudioAndroid: true,
        },
      ],
      "expo-secure-store",
      ["expo-video"],
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#2563EB",
          defaultChannel: "default",
        },
      ],
    ],

    extra: {
      ...config.extra,
      eas: {
        projectId:
          config.extra?.eas?.projectId ??
          process.env.EAS_PROJECT_ID ??
          "ВАШ_EAS_PROJECT_ID",
      },
    },

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};