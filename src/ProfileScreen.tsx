import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal as RNModal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import supabase from 'src/config/supabaseClient';

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------
interface User {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
  };
}

interface ModalProps {
  visible: boolean;
  title?: string;
  message?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelText?: string;
  confirmText?: string;
  isDestructive?: boolean;
}

interface ProfileRowProps {
  // Strongly typing the icon name to match Feather icons
  iconName: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Custom Modal Component
// ---------------------------------------------------------------------------
function Modal({
                 visible,
                 title,
                 message,
                 onCancel,
                 onConfirm,
                 cancelText = 'Cancel',
                 confirmText = 'Confirm',
                 isDestructive = false
               }: ModalProps) {
  return (
      <RNModal visible={visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Text style={styles.modalMessage}>{message}</Text>
            <View style={styles.modalActions}>
              {onCancel && (
                  <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                    <Text style={styles.cancelButtonText}>{cancelText}</Text>
                  </TouchableOpacity>
              )}
              <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    isDestructive ? styles.destructiveButton : styles.primaryButton
                  ]}
                  onPress={onConfirm}
              >
                <Text style={styles.confirmButtonText}>{confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>
  );
}

// ---------------------------------------------------------------------------
// ProfileRow Component
// ---------------------------------------------------------------------------
function ProfileRow({ iconName, label, value }: ProfileRowProps) {
  return (
      <View style={styles.profileRow}>
        <View style={styles.iconContainer}>
          <Feather name={iconName} size={20} color="#3b82f6" />
        </View>
        <View style={styles.profileRowText}>
          <Text style={styles.profileRowLabel}>{label}</Text>
          <Text style={styles.profileRowValue} numberOfLines={1}>{value}</Text>
        </View>
      </View>
  );
}

// ---------------------------------------------------------------------------
// Main App Component
// ---------------------------------------------------------------------------
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [globalScore, setGlobalScore] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [adminModalVisible, setAdminModalVisible] = useState<boolean>(false);
  const [adminPointsInput, setAdminPointsInput] = useState<string>('');
  const [adminSubmitting, setAdminSubmitting] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [modalConfig, setModalConfig] = useState<ModalProps>({ visible: false });

  const loadProfile = useCallback(async () => {
    setLoading(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      // The Hacker Check: Force a crash if there is no user
      if (authError || !user) {
        throw new Error("FATAL: Unauthorized access. No valid user session found.");
      }

      setUser(user);

      // 3. Fetch global_score and is_admin from database
      const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('global_score, is_admin')
          .eq('id', user.id)
          .single();

      if (profileError) {
        console.error("Error fetching user profile score:", profileError);
      }

      // Set score if data exists
      if (profileData && profileData.global_score !== undefined) {
        setGlobalScore(profileData.global_score);
      }

      setIsAdmin(Boolean(profileData?.is_admin));

    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);


  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const handleSignOut = () => {
    setModalConfig({
      visible: true,
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      isDestructive: true,
      confirmText: 'Log out',
      onCancel: () => setModalConfig({ visible: false }),
      onConfirm: async () => {
        setModalConfig({ visible: false });
        setSigningOut(true);

        const { error } = await supabase.auth.signOut();

        if (error) {
          console.error('signOut error:', error.message);
          setSigningOut(false);
          Alert.alert('Log out failed', 'Please try again.');
          return;
        }

        setUser(null);
        setGlobalScore(0);
        setIsAdmin(false);
      }
    });
  };

  const handleBattle = () => {
    setModalConfig({
      visible: true,
      title: 'Battle Initiated!',
      message: 'You have challenged TestProfile1 to a multiplayer battle. Prepare yourself!',
      confirmText: 'Ready',
      onCancel: () => setModalConfig({ visible: false }),
      onConfirm: async () => {
        setModalConfig({ visible: false });

        // Update the database to turn on multiplayer mode
        if (user) {
          const { error } = await supabase
              .from('profiles')
              .update({ is_in_multiplayer_mode: true })
              .eq('id', user.id);
          if (error) {
            console.error("Failed to start battle:", error.message);
            return; // Don't navigate to the calendar screen if DB retrieval unsuccessful
          }
        }
        // Navigate to the calendar screen, since DB retrieval was successful
        router.push('/(tabs)');
      }
    });
  };

  const handleOpenAdminModal = () => {
    setAdminError(null);
    setAdminPointsInput('');
    setAdminModalVisible(true);
  };

  const handleSetAdminPoints = async () => {
    const trimmedValue = adminPointsInput.trim();
    if (!/^[1-9]\d*$/.test(trimmedValue)) {
      setAdminError('Enter a positive integer.');
      return;
    }

    const targetPoints = Number.parseInt(trimmedValue, 10);

    setAdminSubmitting(true);
    setAdminError(null);

    const { error } = await supabase.rpc('admin_set_global_points', {
      target_points: targetPoints,
    });

    setAdminSubmitting(false);

    if (error) {
      console.error('admin_set_global_points error:', error.message);
      setAdminError('Could not update points. Please try again.');
      return;
    }

    setGlobalScore(targetPoints);
    setAdminModalVisible(false);
    setAdminPointsInput('');
  };

  const getUserDisplayName = (u: User | null): string => {
    if (!u) return '';
    const name = u.user_metadata?.full_name;
    if (name) return name;
    return u.email?.split('@')[0] || 'User';
  };

  const getUserInitials = (u: User | null): string => {
    if (!u) return '?';
    const name = getUserDisplayName(u);
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" style={styles.spinner} />
          <Text style={styles.loadingText}>Loading Profile...</Text>
        </View>
    );
  }

  return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Profile</Text>

            <View style={styles.headerActions}>
              {isAdmin ? (
                <TouchableOpacity style={styles.adminButton} onPress={handleOpenAdminModal} activeOpacity={0.8}>
                  <Text style={styles.adminButtonText}>ADMIN</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                  style={[styles.signOutButton, signingOut && styles.signOutDisabled]}
                  onPress={handleSignOut}
                  disabled={signingOut}
              >
                {signingOut ? (
                    <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                    <>
                      <Feather name="log-out" size={16} color="#ef4444" />
                      <Text style={styles.signOutText}>Log out</Text>
                    </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Avatar + name */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{getUserInitials(user)}</Text>
            </View>
            <Text style={styles.userName}>{getUserDisplayName(user) || 'Guest User'}</Text>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>⭐ {globalScore} pts</Text>
            </View>
          </View>

          {/* Info card */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Account</Text>
            <ProfileRow iconName="mail" label="Email" value={user?.email || '—'} />
            <View style={styles.divider} />
            <ProfileRow iconName="user" label="Username" value={getUserDisplayName(user) || '—'} />
            <View style={styles.divider} />
            <ProfileRow iconName="hash" label="User ID" value={user?.id.slice(0, 8).toUpperCase() || '—'} />
          </View>

          {/* Multiplayer battles */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Multiplayer Battles</Text>
            <View style={styles.battleRow}>
              <View style={styles.battleUser}>
                <View style={styles.battleIconContainer}>
                  <Feather name="crosshair" size={20} color="#4f46e5" />
                </View>
                <Text style={styles.battleUserName}>TestProfile1</Text>
              </View>
              <TouchableOpacity style={styles.battleButton} onPress={handleBattle}>
                <Text style={styles.battleButtonText}>Battle</Text>
              </TouchableOpacity>
            </View>
          </View>

  </View>

        {/* Reusable Modal */}
        <Modal {...modalConfig} />

        <RNModal visible={adminModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.adminModalContent}>
              <Text style={styles.modalTitle}>Set points</Text>
              <Text style={styles.modalMessage}>
                Enter a positive integer value to set the global points total.
              </Text>

              <View style={styles.adminInputRow}>
                <TextInput
                  style={styles.adminInput}
                  value={adminPointsInput}
                  onChangeText={(text) => {
                    setAdminPointsInput(text);
                    if (adminError) setAdminError(null);
                  }}
                  placeholder="0"
                  keyboardType="number-pad"
                  editable={!adminSubmitting}
                />
                <TouchableOpacity
                  style={[styles.adminSetButton, adminSubmitting && styles.adminSetButtonDisabled]}
                  onPress={handleSetAdminPoints}
                  activeOpacity={0.85}
                  disabled={adminSubmitting}
                >
                  {adminSubmitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.adminSetButtonText}>Set</Text>
                  )}
                </TouchableOpacity>
              </View>

              {adminError ? <Text style={styles.adminErrorText}>{adminError}</Text> : null}

              <TouchableOpacity
                style={styles.adminCancelButton}
                onPress={() => {
                  setAdminModalVisible(false);
                  setAdminError(null);
                  setAdminPointsInput('');
                }}
                activeOpacity={0.8}
                disabled={adminSubmitting}
              >
                <Text style={styles.adminCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </RNModal>
      </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingTop: 50, // Added padding to compensate for standard View instead of SafeAreaView
  },
  content: {
    padding: 24,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginBottom: 16,
  },
  loadingText: {
    color: '#6b7280',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 24,
    gap: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminButton: {
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  adminButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  adminModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  adminInputRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  adminInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  adminSetButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminSetButtonDisabled: {
    opacity: 0.7,
  },
  adminSetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  adminErrorText: {
    marginTop: 10,
    color: '#dc2626',
    fontSize: 13,
  },
  adminCancelButton: {
    marginTop: 16,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  adminCancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#ffffff',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  scoreBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  scoreText: {
    color: '#b45309',
    fontWeight: '600',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderColor: '#f3f4f6',
    borderWidth: 1,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileRowText: {
    flex: 1,
  },
  profileRowLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  profileRowValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 56,
  },
  battleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  battleUser: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  battleIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  battleUserName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  battleButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
  },
  battleButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    gap: 6,
  },
  signOutDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  modalMessage: {
    color: '#4b5563',
    marginBottom: 24,
    fontSize: 15,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontWeight: '600',
    color: '#374151',
  },
  confirmButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
  },
  destructiveButton: {
    backgroundColor: '#ef4444',
  },
  confirmButtonText: {
    fontWeight: '600',
    color: '#ffffff',
  }
});