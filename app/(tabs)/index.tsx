import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Now it's only two levels up to reach the src folder
import WelcomeScreen from 'src/WelcomeScreen';
import CalendarScreen from 'src/CalendarScreen';
import { processTaskBank } from 'src/AIJudge';

processTaskBank();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  return (
      <SafeAreaView style={styles.app}>
        {isLoggedIn ? (<CalendarScreen />) : (<WelcomeScreen onLogin={() => setIsLoggedIn(true)}/>)}
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: '#fff',
  }
});