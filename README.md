Setup and run app guide for devs:
1. Install Android Studio with Android SDK and emulator
2. Install Adoptium Temurin JDK 17 - LTS: https://adoptium.net/temurin/releases?version=17&os=any&arch=any
3. Run in Powershell to configure Android SDK path: [System.Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:USERPROFILE\AppData\Local\Android\Sdk", [System.EnvironmentVariableTarget]::User)
4. Restart IDE
5. Run in Powershell: npm install
6. Create .env folder with our secret content.
7. Run in Powershell: npx expo run:android
8. Press 'a' and 'enter'
9. Find app with sun icon on emulated device and launch it.
