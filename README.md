Setup and run app guide for devs:
1. Install Android Studio with Android SDK and emulator
2. Install Adoptium Temurin JDK 17 - LTS: https://adoptium.net/temurin/releases?version=17&os=any&arch=any
3. Setup up environment variable ANDROID_HOME: check ANDROID_HOME setup section.
4. Restart IDE
5. Run in Powershell: npm install
6. Create .env folder with our secret content.
7. Run in Powershell: npx expo run:android
8. Press 'a' and 'enter'
9. Find app with sun icon on emulated device and launch it.

ANDROID_HOME setup:
1. Find your SDK Path: Open Android Studio, go to Settings (or Preferences) > Languages & Frameworks > Android SDK. Look for the Android SDK Location at the top.
Common default: C:\Users\YourUsername\AppData\Local\Android\Sdk

2. Open Environment Variables: Search for "Edit the system environment variables" in your Windows search bar.
3. Create ANDROID_HOME:
4. Under User variables, click New.
5. Set 'Variable name': ANDROID_HOME
6. Set 'Variable value': (Paste your SDK path from Step 1).
7. Find the Path variable in the same "User variables" list and click Edit.
8. Click New and add: %ANDROID_HOME%\platform-tools
9. Click New and add: %ANDROID_HOME%\emulator
10. Click 'okay'.
