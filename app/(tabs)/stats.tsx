import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import StatsScreen from 'src/StatsScreen';

export default function StatsTab() {
  return (
    <SafeAreaView style={styles.container}>
      <StatsScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});
