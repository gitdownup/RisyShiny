import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import CalendarScreen from 'src/CalendarScreen';

export default function ScheduleTab() {
  return (
    <SafeAreaView style={styles.container}>
      <CalendarScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
