import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import supabase from 'src/config/supabaseClient';

interface LoginScreenProps {
  onLogin: () => void;
  onGoToSignupScreen: () => void;
}

export default function LoginScreen({ onLogin, onGoToSignupScreen }: LoginScreenProps) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleLogin = async () => {
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });
    setLoading(false);

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setErrorMessage('Invalid email or password. Please try again.');
      } else {
        setErrorMessage(error.message);
      }
      return;
    }

    if (data.user) {
      console.log('Login successful for:', data.user.email);
      onLogin();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <View style={styles.logoWrapper}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🌅</Text>
          </View>
          <Text style={styles.appName}>RisyShiny</Text>
          <Text style={styles.tagline}>Your morning, elevated.</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#BDBDBD"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#BDBDBD"
            secureTextEntry
          />
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={onGoToSignupScreen}>
          <Text style={styles.secondaryButtonText}>Create an account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoEmoji: {
    fontSize: 32,
  },
  appName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  errorBox: {
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#EEEEEE',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: '#BDBDBD',
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#4A90D9',
  },
  secondaryButtonText: {
    color: '#4A90D9',
    fontSize: 16,
    fontWeight: '600',
  },
});
