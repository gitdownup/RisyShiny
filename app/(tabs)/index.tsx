import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { User } from '@supabase/supabase-js';
import supabase from 'src/config/supabaseClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Task {
  id: string;
  title: string;
  scheduledTime: string;
  description: string | null;
  hour: number;
  score: number;
  startTime: Date;
  endTime: Date;
}

interface Profile {
  global_score: number;
  streak?: number;
}

type TaskStatus = 'pending' | 'active' | 'completed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTaskStatus(
  task: Task,
  completedIds: Set<string>,
  activeIds: Set<string>,
): TaskStatus {
  if (completedIds.has(task.id)) return 'completed';
  if (activeIds.has(task.id)) return 'active';
  const now = new Date();
  if (now >= task.startTime && now < task.endTime) return 'active';
  return 'pending';
}

function formatDate(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getUserFirstName(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined;
  if (name) return name.split(' ')[0];
  return (user.email ?? '').split('@')[0];
}

function getUserInitials(user: User): string {
  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? '';
  const parts = name.split(/[@\s]/);
  return parts[0].slice(0, 2).toUpperCase() || '?';
}

// ---------------------------------------------------------------------------
// ProgressRing — two-halves clipping technique, pure React Native
// ---------------------------------------------------------------------------

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const size = 120;
  const stroke = 14;
  const innerSize = size - stroke * 2;
  const pct = total === 0 ? 0 : Math.min(completed / total, 1);
  const degrees = pct * 360;

  // Right clip shows the first 180° of progress (rotates -180→0)
  const rightDeg = -180 + Math.min(degrees, 180);
  // Left clip shows 180→360° of progress (stays at -180 until degrees > 180)
  const leftDeg = degrees > 180 ? degrees - 360 : -180;

  return (
    <View style={{ width: size, height: size }}>
      {/* Grey background track */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: size / 2, borderWidth: stroke, borderColor: '#EEEEEE' },
        ]}
      />

      {/* Right half — reveals 0→180° */}
      <View
        style={{
          position: 'absolute',
          width: size / 2,
          height: size,
          left: size / 2,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            left: -(size / 2),
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: '#4A90D9',
            transform: [{ rotate: `${rightDeg}deg` }],
          }}
        />
      </View>

      {/* Left half — reveals 180→360° */}
      <View
        style={{
          position: 'absolute',
          width: size / 2,
          height: size,
          left: 0,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            left: 0,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: '#4A90D9',
            transform: [{ rotate: `${leftDeg}deg` }],
          }}
        />
      </View>

      {/* White inner circle creates the ring shape */}
      <View
        style={{
          position: 'absolute',
          top: stroke,
          left: stroke,
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={styles.ringFraction}>
          {completed}/{total}
        </Text>
        <Text style={styles.ringLabel}>tasks done</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  status,
  onTap,
}: {
  task: Task;
  status: TaskStatus;
  onTap: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.taskCard,
        status === 'completed' && styles.taskCardCompleted,
        status === 'active' && styles.taskCardActive,
        status === 'pending' && styles.taskCardPending,
      ]}
      onPress={onTap}
      activeOpacity={0.75}
    >
      {/* Status icon */}
      <View
        style={[
          styles.taskIcon,
          status === 'completed' && styles.taskIconCompleted,
          status === 'active' && styles.taskIconActive,
        ]}
      >
        {status === 'completed' && (
          <Ionicons name="checkmark" size={16} color="#4A90D9" />
        )}
        {status === 'active' && (
          <Ionicons name="play" size={13} color="#F9A825" />
        )}
        {status === 'pending' && <View style={styles.pendingDot} />}
      </View>

      {/* Title + description */}
      <View style={styles.taskInfo}>
        <Text
          style={[
            styles.taskTitle,
            status === 'completed' && styles.taskTitleDone,
          ]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <Text style={styles.taskSub} numberOfLines={1}>
          {task.description ?? task.scheduledTime}
        </Text>
      </View>

      {/* Time badge */}
      <View style={[styles.timeBadge, status === 'active' && styles.timeBadgeActive]}>
        <Text
          style={[styles.timeBadgeText, status === 'active' && styles.timeBadgeTextActive]}
        >
          {task.scheduledTime}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// HomeScreen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local status overrides
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());

  // Track the original total so the ring doesn't shrink after completion
  const [initialTotal, setInitialTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) {
      setLoading(false);
      return;
    }
    setUser(u);

    // Fetch today's events
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const { data: eventsData, error: eventsErr } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', u.id)
      .gte('start_time', dayStart)
      .lt('start_time', dayEnd)
      .order('start_time', { ascending: true });

    if (eventsErr) {
      setError('Could not load tasks. Pull to refresh.');
    } else if (eventsData) {
      const mapped: Task[] = eventsData.map((e: {
        id: string;
        title: string;
        description: string | null;
        start_time: string;
        end_time: string;
        score: number;
      }) => {
        const startTime = new Date(e.start_time);
        const endTime = new Date(e.end_time);
        const hour = startTime.getHours();
        const h12 = hour % 12 === 0 ? 12 : hour % 12;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return {
          id: e.id,
          title: e.title,
          scheduledTime: `${h12}:00 ${ampm}`,
          description: e.description,
          hour,
          score: e.score ?? 0,
          startTime,
          endTime,
        };
      });
      setTasks(mapped);
      setInitialTotal(mapped.length);
    }

    // Fetch profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('global_score, streak')
      .eq('id', u.id)
      .single();

    if (profileData) {
      setProfile(profileData as Profile);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTaskTap = async (task: Task) => {
    const status = getTaskStatus(task, completedIds, activeIds);

    if (status === 'pending') {
      setActiveIds(prev => new Set([...prev, task.id]));
    } else if (status === 'active') {
      // Mark completed optimistically
      setCompletedIds(prev => new Set([...prev, task.id]));
      setCompletedCount(prev => prev + 1);

      // Award points via DB function
      const { error: rpcErr } = await supabase.rpc('score_task', {
        target_event_id: task.id,
      });
      if (rpcErr) console.error('score_task error:', rpcErr.message);

      // Delete event from DB
      await supabase.from('events').delete().eq('id', task.id);

      // Remove from list after a brief visual pause
      setTimeout(() => {
        setTasks(prev => prev.filter(t => t.id !== task.id));
        setCompletedIds(prev => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, 1400);
    }
    // completed state: no further action
  };

  const timeLeftMinutes = useMemo(() => {
    if (tasks.length === 0) return 0;
    const last = tasks[tasks.length - 1];
    return Math.max(0, Math.floor((last.endTime.getTime() - Date.now()) / 60_000));
  }, [tasks]);

  const streak = profile?.streak ?? 0;
  const today = new Date();

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.dateText}>{formatDate(today)}</Text>
            <Text style={styles.greetingText}>
              {getGreeting()},{'\n'}
              {user ? getUserFirstName(user) : 'there'} 👋
            </Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user ? getUserInitials(user) : '?'}
            </Text>
          </View>
        </View>

        {/* ── Error banner ── */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {/* ── Today's Progress ── */}
        <Text style={styles.sectionTitle}>Today's Progress</Text>

        <View style={styles.progressRow}>
          <View style={styles.ringCard}>
            <ProgressRing
              completed={completedCount}
              total={Math.max(initialTotal, completedCount)}
            />
          </View>

          <View style={styles.statCol}>
            <View style={[styles.statCard, styles.streakCard]}>
              <Text style={styles.statEmoji}>🔥</Text>
              <Text style={styles.statValue}>{streak}</Text>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>

            <View style={[styles.statCard, styles.timeCard]}>
              <Text style={styles.statEmoji}>⏱</Text>
              <Text style={styles.statValue}>
                {timeLeftMinutes >= 60
                  ? `${Math.floor(timeLeftMinutes / 60)}h`
                  : `${timeLeftMinutes}m`}
              </Text>
              <Text style={styles.statLabel}>Time Left</Text>
            </View>
          </View>
        </View>

        {/* ── Morning Routine ── */}
        <View style={styles.routineHeader}>
          <Text style={styles.sectionTitle}>Morning Routine</Text>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/(tabs)/schedule')}
          >
            <Ionicons name="pencil-outline" size={13} color="#4A90D9" />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🌅</Text>
            <Text style={styles.emptyTitle}>No tasks scheduled today</Text>
            <Text style={styles.emptySub}>
              Tap the + button or go to Schedule to add tasks.
            </Text>
          </View>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              status={getTaskStatus(task, completedIds, activeIds)}
              onTap={() => handleTaskTap(task)}
            />
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    marginTop: 8,
  },
  dateText: {
    fontSize: 13,
    color: '#888888',
    fontWeight: '600',
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 30,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Error
  errorBanner: {
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorBannerText: {
    color: '#D32F2F',
    fontSize: 13,
  },

  // Section
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },

  // Progress row
  progressRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
    alignItems: 'stretch',
  },
  ringCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  ringFraction: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  ringLabel: {
    fontSize: 10,
    color: '#888888',
    marginTop: 2,
  },
  statCol: {
    flex: 1,
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  streakCard: {
    backgroundColor: '#FFF8E1',
  },
  timeCard: {
    backgroundColor: '#E8F5E9',
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  statLabel: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '600',
    marginTop: 2,
  },

  // Routine header
  routineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EBF4FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 11,
  },
  editBtnText: {
    fontSize: 13,
    color: '#4A90D9',
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Task card
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  taskCardCompleted: {
    backgroundColor: '#F0F7FF',
  },
  taskCardActive: {
    backgroundColor: '#FFFDE7',
  },
  taskCardPending: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  taskIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  taskIconCompleted: {
    backgroundColor: '#EBF4FF',
    borderColor: '#4A90D9',
  },
  taskIconActive: {
    backgroundColor: '#FFF9C4',
    borderColor: '#F9A825',
  },
  pendingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#BDBDBD',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#888888',
  },
  taskSub: {
    fontSize: 12,
    color: '#888888',
  },
  timeBadge: {
    backgroundColor: '#EEEEEE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 11,
    marginLeft: 8,
  },
  timeBadgeActive: {
    backgroundColor: '#FFF9C4',
  },
  timeBadgeText: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '600',
  },
  timeBadgeTextActive: {
    color: '#F9A825',
  },
});
