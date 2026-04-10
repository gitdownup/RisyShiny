import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import supabase from 'src/config/supabaseClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayStat {
  label: string;   // e.g. "Mon"
  dateKey: string; // e.g. "2025-04-07"
  count: number;
}

interface StatsData {
  globalScore: number;
  streak: number;
  todayCount: number;
  weekStats: DayStat[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildWeekStats(eventRows: { start_time: string }[]): DayStat[] {
  const today = new Date();
  const days: DayStat[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    days.push({
      label: DAY_LABELS[d.getDay()],
      dateKey: key,
      count: 0,
    });
  }

  for (const row of eventRows) {
    const key = new Date(row.start_time).toISOString().slice(0, 10);
    const day = days.find(d => d.dateKey === key);
    if (day) day.count += 1;
  }

  return days;
}

// ---------------------------------------------------------------------------
// BarChart
// ---------------------------------------------------------------------------

function BarChart({ data }: { data: DayStat[] }) {
  const maxVal = Math.max(...data.map(d => d.count), 1);

  return (
    <View style={chart.container}>
      {data.map((item, i) => {
        const heightPct = item.count / maxVal;
        const isToday = i === data.length - 1;
        return (
          <View key={item.dateKey} style={chart.barCol}>
            <View style={chart.barTrack}>
              <View
                style={[
                  chart.barFill,
                  {
                    height: `${Math.max(heightPct * 100, item.count === 0 ? 4 : 8)}%`,
                    backgroundColor: isToday ? '#4A90D9' : '#BDD7F5',
                  },
                ]}
              />
            </View>
            <Text style={[chart.barLabel, isToday && chart.barLabelToday]}>
              {item.label}
            </Text>
            <Text style={chart.barCount}>{item.count}</Text>
          </View>
        );
      })}
    </View>
  );
}

const chart = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 120,
    paddingTop: 8,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
    minHeight: 4,
  },
  barLabel: {
    marginTop: 6,
    fontSize: 11,
    color: '#888888',
    fontWeight: '600',
  },
  barLabelToday: {
    color: '#4A90D9',
  },
  barCount: {
    fontSize: 10,
    color: '#BDBDBD',
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// StatsScreen
// ---------------------------------------------------------------------------

export default function StatsScreen() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('global_score, streak')
      .eq('id', user.id)
      .single();

    // Today's events
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const { data: todayEvents, error: todayErr } = await supabase
      .from('events')
      .select('id')
      .eq('user_id', user.id)
      .gte('start_time', dayStart)
      .lt('start_time', dayEnd);

    if (todayErr) {
      setError('Failed to load stats.');
      setLoading(false);
      return;
    }

    // Past 7 days events (for bar chart)
    const sevenAgo = new Date();
    sevenAgo.setDate(sevenAgo.getDate() - 6);
    sevenAgo.setHours(0, 0, 0, 0);

    const { data: weekEvents } = await supabase
      .from('events')
      .select('start_time')
      .eq('user_id', user.id)
      .gte('start_time', sevenAgo.toISOString());

    setData({
      globalScore: (profile as { global_score: number; streak?: number } | null)?.global_score ?? 0,
      streak: (profile as { global_score: number; streak?: number } | null)?.streak ?? 0,
      todayCount: todayEvents?.length ?? 0,
      weekStats: buildWeekStats(weekEvents ?? []),
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>{error ?? 'No data available.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>Your Stats</Text>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, styles.scoreCard]}>
          <Text style={styles.summaryEmoji}>⭐</Text>
          <Text style={styles.summaryValue}>{data.globalScore}</Text>
          <Text style={styles.summaryLabel}>Global Score</Text>
        </View>

        <View style={[styles.summaryCard, styles.streakCard]}>
          <Text style={styles.summaryEmoji}>🔥</Text>
          <Text style={styles.summaryValue}>{data.streak}</Text>
          <Text style={styles.summaryLabel}>Day Streak</Text>
        </View>

        <View style={[styles.summaryCard, styles.todayCard]}>
          <Text style={styles.summaryEmoji}>📋</Text>
          <Text style={styles.summaryValue}>{data.todayCount}</Text>
          <Text style={styles.summaryLabel}>Today</Text>
        </View>
      </View>

      {/* Weekly activity chart */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Weekly Activity</Text>
        <Text style={styles.chartSub}>Tasks scheduled per day</Text>
        <BarChart data={data.weekStats} />
      </View>

      {/* Completion note */}
      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>💡 How scoring works</Text>
        <Text style={styles.noteBody}>
          Each task is scored by the AI Judge based on its difficulty. Complete tasks before
          their scheduled end time to earn points and keep your streak alive.
        </Text>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#888888',
    fontSize: 14,
  },
  scroll: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 20,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
    marginTop: 8,
  },

  // Summary cards row
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  scoreCard: {
    backgroundColor: '#FFFFFF',
  },
  streakCard: {
    backgroundColor: '#FFF8E1',
  },
  todayCard: {
    backgroundColor: '#F0F7FF',
  },
  summaryEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },

  // Chart
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  chartSub: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 16,
  },

  // Note
  noteCard: {
    backgroundColor: '#EBF4FF',
    borderRadius: 14,
    padding: 16,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  noteBody: {
    fontSize: 13,
    color: '#555555',
    lineHeight: 20,
  },
});
