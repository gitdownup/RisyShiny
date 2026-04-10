// Placeholder — the + tab button in _layout.tsx opens /modal directly.
// This file must exist for expo-router to recognise the "add" segment.
import { View, StyleSheet } from 'react-native';

export default function AddTab() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
});
