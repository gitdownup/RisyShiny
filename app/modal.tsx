import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import supabase from 'src/config/supabaseClient';
import { notificationService } from 'src/notifications/NotificationService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h12}:00 ${ampm}`;
}

// ---------------------------------------------------------------------------
// Modal screen
// ---------------------------------------------------------------------------

export default function AddTaskModal() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a task name.');
      return;
    }
    if (selectedHour === null) {
      Alert.alert('Missing time', 'Please select a time for this task.');
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const start = new Date();
    start.setHours(selectedHour, 0, 0, 0);
    const end = new Date();
    end.setHours(selectedHour + 1, 0, 0, 0);

    const { data, error } = await supabase
      .from('events')
      .insert({
        user_id: user.id,
        title: title.trim(),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        score: 0,
        has_menu_open: false,
        is_reported: false,
      })
      .select()
      .single();

    if (error) {
      setSaving(false);
      Alert.alert('Error', 'Could not save task. Please try again.');
      return;
    }

    // Schedule start notification
    if (data) {
      try {
        await notificationService.scheduleNotify({
          title: `Start: ${title.trim()}`,
          body: `Your task at ${hourLabel(selectedHour)} starts now!`,
          at: start,
          data: { path: '/(tabs)' },
        });
      } catch (e) {
        console.error('Notification scheduling error:', e);
      }
    }

    setSaving(false);
    router.dismiss();
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.dismiss()}>
          <Ionicons name="close" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Task</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Task name input */}
        <Text style={styles.fieldLabel}>Task name</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Morning run, Meditate, Read..."
          placeholderTextColor="#BDBDBD"
          autoFocus
          returnKeyType="done"
          maxLength={80}
        />

        {/* Hour picker */}
        <Text style={styles.fieldLabel}>Schedule for</Text>
        <FlatList
          data={hours}
          keyExtractor={item => String(item)}
          horizontal={false}
          numColumns={3}
          contentContainerStyle={styles.hourGrid}
          scrollEnabled={false}
          renderItem={({ item: hour }) => {
            const isSelected = selectedHour === hour;
            const isPast = hour < new Date().getHours();
            return (
              <TouchableOpacity
                style={[
                  styles.hourCell,
                  isSelected && styles.hourCellSelected,
                  isPast && styles.hourCellPast,
                ]}
                onPress={() => setSelectedHour(hour)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.hourCellText,
                    isSelected && styles.hourCellTextSelected,
                    isPast && styles.hourCellTextPast,
                  ]}
                >
                  {hourLabel(hour)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  saveBtn: {
    backgroundColor: '#4A90D9',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 64,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Body
  body: {
    flex: 1,
    padding: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  titleInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 24,
  },

  // Hour grid
  hourGrid: {
    gap: 8,
  },
  hourCell: {
    flex: 1,
    margin: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  hourCellSelected: {
    backgroundColor: '#4A90D9',
    borderColor: '#4A90D9',
  },
  hourCellPast: {
    backgroundColor: '#FAFAFA',
    borderColor: '#F0F0F0',
  },
  hourCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  hourCellTextSelected: {
    color: '#FFFFFF',
  },
  hourCellTextPast: {
    color: '#BDBDBD',
  },
});
