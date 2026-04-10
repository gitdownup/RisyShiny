import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import supabase from 'src/config/supabaseClient';
import LoginScreen from 'src/LoginScreen';
import SignupScreen from 'src/SignupScreen';

type AuthView = 'login' | 'signup';

export default function TabLayout() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [authView, setAuthView] = useState<AuthView>('login');

  useEffect(() => {
    // Subscribe first so we don't miss the initial auth event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    // Then hydrate with the current session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Splash / loading
  if (session === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  // Not authenticated — render auth screens
  if (!session) {
    if (authView === 'login') {
      return (
        <LoginScreen
          onLogin={() => {}}
          onGoToSignupScreen={() => setAuthView('signup')}
        />
      );
    }
    return (
      <SignupScreen
        onGoToLoginScreen={() => setAuthView('login')}
      />
    );
  }

  // Authenticated — render tab navigator
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4A90D9',
        tabBarInactiveTintColor: '#BDBDBD',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconPill, focused && styles.iconPillActive]}>
              <Ionicons
                name={focused ? 'home' : 'home-outline'}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarButton: () => (
            <TouchableOpacity
              style={styles.addTabButton}
              onPress={() => router.push('/modal')}
              activeOpacity={0.85}
            >
              <View style={styles.addButton}>
                <Ionicons name="add" size={28} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          ),
        }}
      />

      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'bar-chart' : 'bar-chart-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* Hide legacy screens from tab bar */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#EEEEEE',
    borderTopWidth: 1,
    height: 70,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  iconPill: {
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 20,
  },
  iconPillActive: {
    backgroundColor: '#EBF4FF',
  },
  addTabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
