import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { User } from '@supabase/supabase-js';
import supabase from 'src/config/supabaseClient';

// ---------------------------------------------------------------------------
// ProfileRow
// ---------------------------------------------------------------------------

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color="#4A90D9" />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ProfileScreen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [globalScore, setGlobalScore] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);

    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { setLoading(false); return; }
    setUser(u);

    const { data: profile } = await supabase
      .from('profiles')
      .select('global_score')
      .eq('id', u.id)
      .single();

    if (profile) {
      setGlobalScore((profile as { global_score: number }).global_score ?? 0);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            const { error } = await supabase.auth.signOut();
            if (error) {
              console.error('Sign out error:', error.message);
              setSigningOut(false);
            }
            // Auth state change in _layout.tsx automatically switches to login
          },
        },
      ],
    );
  };

  const getUserDisplayName = (u: User): string => {
    const name = u.user_metadata?.full_name as string | undefined;
    if (name) return name;
    return u.email?.split('@')[0] ?? 'User';
  };

  const getUserInitials = (u: User): string => {
    const name = getUserDisplayName(u);
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>Profile</Text>

      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {user ? getUserInitials(user) : '?'}
          </Text>
        </View>
        <Text style={styles.displayName}>
          {user ? getUserDisplayName(user) : ''}
        </Text>
        <View style={styles.scorePill}>
          <Text style={styles.scorePillEmoji}>⭐</Text>
          <Text style={styles.scorePillText}>{globalScore} pts</Text>
        </View>
      </View>

      {/* Info card */}
      <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>Account</Text>

        <ProfileRow
          icon="mail-outline"
          label="Email"
          value={user?.email ?? '—'}
        />

        <View style={styles.divider} />

        <ProfileRow
          icon="person-outline"
          label="Username"
          value={user ? getUserDisplayName(user) : '—'}
        />

        <View style={styles.divider} />

        <ProfileRow
          icon="id-card-outline"
          label="User ID"
          value={user?.id.slice(0, 8).toUpperCase() ?? '—'}
        />
      </View>

      {/* Score card */}
      <View style={[styles.infoCard, styles.scoreCard]}>
        <Text style={styles.cardTitle}>Performance</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreItem}>
            <Text style={styles.scoreItemValue}>{globalScore}</Text>
            <Text style={styles.scoreItemLabel}>Global Score</Text>
          </View>
          <View style={styles.scoreItemDivider} />
          <View style={styles.scoreItem}>
            <Text style={styles.scoreItemValue}>🌅</Text>
            <Text style={styles.scoreItemLabel}>RisyShiny</Text>
          </View>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity
        style={[styles.signOutBtn, signingOut && styles.signOutBtnDisabled]}
        onPress={handleSignOut}
        disabled={signingOut}
        activeOpacity={0.8}
      >
        {signingOut ? (
          <ActivityIndicator color="#D32F2F" />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={18} color="#D32F2F" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </>
        )}
      </TouchableOpacity>

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
    marginBottom: 24,
    marginTop: 8,
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  scorePillEmoji: {
    fontSize: 14,
  },
  scorePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F9A825',
  },

  // Info card
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  scoreCard: {
    backgroundColor: '#F0F7FF',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '600',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '400',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginLeft: 48,
  },

  // Score row
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  scoreItemValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  scoreItemLabel: {
    fontSize: 12,
    color: '#888888',
    fontWeight: '600',
  },
  scoreItemDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#EEEEEE',
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
    marginTop: 8,
  },
  signOutBtnDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D32F2F',
  },
});
