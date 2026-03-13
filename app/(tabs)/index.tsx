// Import react stuff
import React from 'react';
import { globalStyles } from 'src/GlobalStyles';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import files
import LoginScreen from 'src/LoginScreen';
import SignupScreen from 'src/SignupScreen';
import CalendarScreen from 'src/CalendarScreen';

// Import test case files
import { processTaskBank } from 'src/AIJudgeTestCases';

// Execute tests
processTaskBank();

// Begin app event loop
export default function App() {
  const [currentScreen, setCurrentScreen] = React.useState<'login' | 'signup' | 'calendar'>('login');

  const screens = {
    login: <LoginScreen
        onLogin={() => setCurrentScreen('calendar')}
        onGoToSignupScreen={() => setCurrentScreen('signup')}
    />,
    signup: <SignupScreen
        onGoToLoginScreen={() => setCurrentScreen('login')}
    />,
    calendar: <CalendarScreen />
  };

  return (
      <SafeAreaView style={globalStyles.appContainer}>
        {screens[currentScreen]}
      </SafeAreaView>
  );
}