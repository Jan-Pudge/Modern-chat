# Інструкція 16: Локальна збірка автономного Android-додатку (Standalone APK)

У цій інструкції ми зберемо справжній **нативний Android-додаток (APK)** безпосередньо на вашому комп'ютері, встановимо його на смартфон та перевіримо повністю автономну роботу з базою даних **Convex** — без Expo Go, без Metro Bundler, без хмарних черг EAS.

---

## Зміст

1. [Чому Expo Go недостатньо для продакшн-додатку](#чому-expo-go-недостатньо-для-продакшн-додатку)
2. [Архітектура збірки: від TypeScript до APK](#архітектура-збірки-від-typescript-до-apk)
3. [Крок 1: Налаштування JDK 17 та Android SDK](#крок-1-налаштування-jdk-17-та-android-sdk)
4. [Крок 2: Динамічна конфігурація `app.config.ts`](#крок-2-динамічна-конфігурація-appconfigts)
5. [Крок 3: Генерація нативного коду (`expo prebuild`)](#крок-3-генерація-нативного-коду-expo-prebuild)
6. [Крок 4: Збірка APK через Gradle](#крок-4-збірка-apk-через-gradle)
7. [Крок 5: Встановлення на пристрій через ADB](#крок-5-встановлення-на-пристрій-через-adb)
8. [Вирішення типових помилок (Troubleshooting)](#вирішення-типових-помилок-troubleshooting)
9. [Тестування та чекліст перевірки](#тестування-та-чекліст-перевірки)

---

## Чому Expo Go недостатньо для продакшн-додатку

Під час розробки ви використовували Expo Go — спеціальний клієнт, який зчитує ваш JavaScript-код із Metro Bundler у режимі реального часу:

```
┌─────────────────────────────────────────────────────┐
│  РЕЖИМ РОЗРОБКИ (Expo Go)                           │
│                                                     │
│  Комп'ютер               Смартфон                  │
│  ┌──────────────┐  Wi-Fi  ┌─────────────────────┐  │
│  │ Metro Bundler│ ──────► │   Expo Go App       │  │
│  │ (localhost)  │  :8081  │ (завантажує JS)     │  │
│  └──────────────┘         └─────────────────────┘  │
│                                                     │
│  ❌ Потрібен запущений сервер на комп'ютері        │
│  ❌ Додаток не можна передати іншій людині          │
│  ❌ Не можна опублікувати в Google Play             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  STANDALONE APK (результат цієї інструкції)         │
│                                                     │
│  Смартфон                                          │
│  ┌─────────────────────────────────────────────┐   │
│  │  Prostir.apk                                │   │
│  │  ├── JavaScript бандл (вбудований)          │   │
│  │  ├── Нативні бібліотеки (C++, Kotlin)       │   │
│  │  └── Ресурси (іконки, зображення, шрифти)   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ✅ Повністю автономний — не потребує комп'ютера   │
│  ✅ Працює з Convex через мобільний інтернет        │
│  ✅ Можна передати друзям або в Google Play         │
└─────────────────────────────────────────────────────┘
```

---

## Архітектура збірки: від TypeScript до APK

Весь процес збірки складається з трьох послідовних етапів:

```
app.config.ts          expo prebuild           Gradle
────────────────   ──────────────────────   ─────────────────
Конфігурація   ►  Генерація /android/   ►  Компіляція APK
(TypeScript)       (Kotlin, XML, C++)        (Java → APK)
```

**Що відбувається на кожному етапі:**

| Етап | Інструмент | Вхід | Вихід |
|------|-----------|------|-------|
| 1 | `expo prebuild` | `app.config.ts` + `package.json` | Папка `/android` |
| 2 | `gradlew assembleDebug` | Папка `/android` | `app-debug.apk` |
| 3 | `adb install` | `app-debug.apk` | Встановлений додаток на пристрої |

---

## Крок 1: Налаштування JDK 17 та Android SDK

### Чому саме JDK 17?

> [!CAUTION]
> Gradle та React Native суворо прив'язані до Java 17. Java 21, 23 або 25 призведуть до помилки `Unsupported class file major version` або збою компіляції C++ модулів.

### Встановлення JDK 17:

#### 🔹 Windows (PowerShell від адміністратора):
```powershell
winget install Microsoft.OpenJDK.17
```

#### 🔹 macOS:
```bash
brew install openjdk@17
sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
```

#### 🔹 Linux (Ubuntu / Debian):
```bash
sudo apt update && sudo apt install -y openjdk-17-jdk
```

### Перевірка Java:
```bash
javac -version
# javac 17.0.x  ✅
```

### Налаштування змінних середовища:

#### 🔹 Windows (PowerShell):
```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot", "User")
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:USERPROFILE\AppData\Local\Android\Sdk", "User")

$current = [Environment]::GetEnvironmentVariable("PATH", "User")
[Environment]::SetEnvironmentVariable("PATH", "$current;$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools;$env:USERPROFILE\AppData\Local\Android\Sdk\cmdline-tools\latest\bin", "User")
```
> ⚠️ Шлях до `JAVA_HOME` залежить від версії та вендора вашого JDK. Уточніть точний шлях у `C:\Program Files\`.

#### 🔹 macOS (`~/.zshrc`):
```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

#### 🔹 Linux (`~/.bashrc`):
```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

### Перевірка ADB:
```bash
adb --version
# Android Debug Bridge version 1.0.41  ✅
```

---

## Крок 2: Динамічна конфігурація `app.config.ts`

Замість статичного `app.json` ми використовуємо динамічний TypeScript-файл, який змінює налаштування залежно від змінної середовища `APP_ENV`.

### 2.1. Зробіть резервну копію `app.json`:
```bash
cp app.json app.json.backup
```

### 2.2. Видаліть `app.json`:
```bash
# macOS / Linux:
rm app.json

# Windows PowerShell:
Remove-Item app.json
```

### 2.3. Створіть `app.config.ts` у корені проєкту:

```typescript
// app.config.ts
import { ConfigContext, ExpoConfig } from "expo/config";

const APP_NAME = "Prostir";
const PACKAGE_NAME = "com.prostir.app";
const SCHEME = "prostir";

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment =
    (process.env.APP_ENV as "development" | "preview" | "production") ||
    "development";

  console.log("⚙️  Поточне середовище збірки:", environment);
  console.log("📦 URL бази даних Convex:", process.env.EXPO_PUBLIC_CONVEX_URL);

  const isDev = environment === "development";

  return {
    ...config,
    name: isDev ? `${APP_NAME} Dev` : APP_NAME,
    slug: "prostir",
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
          "Додатку Prostir потрібен доступ до камери для запису круглих відеоповідомлень.",
        NSMicrophoneUsageDescription:
          "Додатку Prostir потрібен доступ до мікрофона для запису звуку у відеоповідомленнях.",
      },
    },

    android: {
      package: isDev ? `${PACKAGE_NAME}.dev` : PACKAGE_NAME,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
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
      "expo-secure-store",
      [
        "expo-audio",
        {
          microphonePermission:
            "Дозвольте Prostir доступ до мікрофона для запису голосових сповіщень до публікацій.",
          recordAudioAndroid: true,
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission:
            "Додатку Prostir потрібен доступ до камери для запису відеокружечків.",
          microphonePermission:
            "Додатку Prostir потрібен доступ до мікрофона для запису звуку у відеокружечках.",
        },
      ],
      ["expo-video"],
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
```

### Як це працює:

| Змінна `APP_ENV` | `name` | `package` / `bundleIdentifier` | `scheme` |
|---|---|---|---|
| `development` (або не задана) | `Prostir Dev` | `com.prostir.app.dev` | `prostir-dev` |
| `production` | `Prostir` | `com.prostir.app` | `prostir` |

> [!NOTE]
> Завдяки різним `package` у Dev та Production обидва APK можна встановити на один смартфон **одночасно** — вони не конфліктують між собою.

---

## Крок 3: Генерація нативного коду (`expo prebuild`)

Expo читає ваш `app.config.ts` і генерує повноцінну нативну папку `/android`:

```bash
npx expo prebuild --platform android --clean
```

Прапор `--clean` видаляє стару папку `/android` і генерує з нуля, що запобігає конфліктам між плагінами.

### Що генерується у папці `/android`:

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml   ← дозволи (CAMERA, RECORD_AUDIO...)
│   │   └── res/                  ← іконки, кольори splash-screen
│   └── build.gradle              ← версія SDK, залежності
├── build.gradle                  ← репозиторії Gradle
├── gradle.properties             ← налаштування JVM
├── gradlew                       ← скрипт збірки (Linux/macOS)
└── gradlew.bat                   ← скрипт збірки (Windows)
```

### Налаштування `android/local.properties`:

Gradle повинен знати де знаходиться Android SDK. Створіть або перевірте файл `android/local.properties`:

```properties
# Windows:
sdk.dir=C\:\\Users\\<username>\\AppData\\Local\\Android\\Sdk

# macOS:
# sdk.dir=/Users/<username>/Library/Android/sdk

# Linux (системна установка через apt):
# sdk.dir=/usr/lib/android-sdk
```

---

## Крок 4: Збірка APK через Gradle

### Оптимізація пам'яті JVM:

Відкрийте `android/gradle.properties` та переконайтесь у наявності:

```properties
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
org.gradle.parallel=true
org.gradle.caching=true
```

> [!TIP]
> Якщо у вас 16+ ГБ RAM — збільшіть до `-Xmx4096m` для прискорення збірки.

### Debug APK (швидко, для тестування):

```bash
# macOS / Linux:
cd android
chmod +x gradlew    # лише один раз
./gradlew assembleDebug

# Windows:
cd android
.\gradlew.bat assembleDebug
```

**Результат:**
```
BUILD SUCCESSFUL in 4m 12s
123 actionable tasks: 123 executed
```

**Шлях до APK:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Release APK (автономний, для розповсюдження):

```bash
# macOS / Linux:
./gradlew assembleRelease

# Windows:
.\gradlew.bat assembleRelease
```

**Шлях до APK:**
```
android/app/build/outputs/apk/release/app-release.apk
```

> [!IMPORTANT]
> **Debug APK** містить налагоджувальний код та може намагатись підключитися до Metro Bundler. **Release APK** — повністю автономний: весь JavaScript запакований всередину, Metro не потрібен.

### ⏳ Очікуваний час:
- **Перша збірка:** 5–15 хвилин (завантаження Gradle залежностей та Android NDK)
- **Наступні збірки:** 1–3 хвилини (завдяки кешу)

---

## Крок 5: Встановлення на пристрій через ADB

### Підготовка Android-пристрою:

1. **Налаштування** → **Про телефон** → натисніть **«Номер збірки»** 7 разів поспіль.
2. З'явиться новий розділ **«Параметри розробника»** (Developer Options).
3. Увімкніть **«Налагодження по USB»** (USB Debugging).
4. Підключіть телефон до комп'ютера якісним USB-кабелем (має підтримувати передачу даних).

### Перевірка підключення:

```bash
adb devices
```

```
List of devices attached
RF8N21ABCDE    device    ✅  (готовий)
RF8N21ABCDE    unauthorized  ⚠️  (розблокуйте екран і підтвердіть на телефоні)
```

### Встановлення APK:

```bash
# З кореня проєкту:

# Debug:
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Release:
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Після успіху:
```
Performing Streamed Install
Success ✅
```

Прапор `-r` означає **reinstall** — перевстановлення з оновленням без втрати даних.

### Альтернатива: передача файлу без кабелю:

Надішліть файл `app-release.apk` через Telegram або Google Drive на свій телефон, відкрийте та натисніть **«Встановити»**.

---

## Вирішення типових помилок (Troubleshooting)

### ❌ `Permission denied: ./gradlew`
**Причина:** Відсутні права на виконання скрипту (Linux/macOS).
```bash
chmod +x android/gradlew
```

---

### ❌ `SDK location not found`
**Причина:** Gradle не бачить Android SDK.
**Вирішення:** Перевірте файл `android/local.properties` — шлях до `sdk.dir` має бути точним та без помилок у слешах.

---

### ❌ `Unsupported class file major version`
**Причина:** Використовується Java 21/23/25 замість Java 17.
```bash
javac -version    # має бути 17.x.x
java -version     # має бути 17.x.x

# Якщо версія інша — перевірте змінну JAVA_HOME
echo $JAVA_HOME   # macOS/Linux
$env:JAVA_HOME    # Windows PowerShell
```

---

### ❌ `Java heap space` або `Daemon disappeared`
**Причина:** Не вистачає оперативної пам'яті для збірки.
**Вирішення:** Збільшіть пам'ять у `android/gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
```
Також зупиніть підвислі процеси Gradle:
```bash
./gradlew --stop
```

---

### ❌ `Failed to install the following Android SDK packages: licenses not accepted`
**Причина:** Не прийнято ліцензійні угоди Android SDK.
**Вирішення:** Відкрийте **Android Studio → SDK Manager → SDK Tools** і переконайтесь що всі необхідні компоненти встановлені (це автоматично приймає ліцензії). Або виконайте:
```bash
yes | sdkmanager --licenses
```

---

### ❌ Додаток не підключається до Convex (Release APK)
**Причина:** `EXPO_PUBLIC_CONVEX_URL` не вбудований у Release APK.
**Вирішення:** Перевірте `.env.local` та перегенеруйте пребілд:
```bash
cat .env.local
# Має містити: EXPO_PUBLIC_CONVEX_URL=https://...convex.cloud

npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

---

### Очищення кешу Gradle (universal fix):
```bash
# З папки android/:
./gradlew clean

# Або чистий пребілд з нуля (з кореня проєкту):
npx expo prebuild --platform android --clean
```

---

## Тестування та чекліст перевірки

### Тест автономності (найважливіший):

1. **Зупиніть Metro Bundler** (`Ctrl + C` у терміналі з `npx expo start`).
2. **Від'єднайте смартфон від USB**.
3. **Запустіть додаток** на смартфоні.
4. Переконайтесь що додаток **не показує екран помилки підключення до Metro**.

### Чекліст ✅

- [ ] `javac -version` повертає `17.x.x`
- [ ] `adb --version` виконується з будь-якої папки
- [ ] `app.config.ts` створено, `app.json` видалено
- [ ] `npx expo prebuild --platform android --clean` завершився без помилок
- [ ] Файл `android/local.properties` створено з правильним `sdk.dir`
- [ ] `./gradlew assembleDebug` або `assembleRelease` завершився зі статусом `BUILD SUCCESSFUL`
- [ ] APK встановлено на пристрій (`adb install` або вручну)
- [ ] Додаток запускається на смартфоні **без Metro Bundler**
- [ ] Відображається правильна іконка та назва (`Prostir Dev` або `Prostir`)
- [ ] Авторизація та завантаження даних із Convex працює через мобільний інтернет
