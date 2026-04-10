import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import ProfileScreen from 'src/ProfileScreen';

export default function ProfileTab() {
  return (
    <SafeAreaView style={styles.container}>
      <ProfileScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});
