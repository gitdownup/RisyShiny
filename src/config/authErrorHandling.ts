type AuthAction = 'login' | 'signup';

type AuthRequestResult = {
  data: any;
  error: { message: string } | null;
};

type AuthRequestOptions = {
  action: AuthAction;
  request: () => Promise<AuthRequestResult>;
  setLoading: (loading: boolean) => void;
  setErrorMessage: (message: string) => void;
  onSuccess: (data: any) => void;
};

// Tell the user why their email/password was rejected
export const getAuthErrorMessage = (action: AuthAction, rawMessage: string) => {
  const message = rawMessage.toLowerCase();

  if (action === 'login' && message.includes('invalid login credentials')) {
    return 'Invalid email or password. Please try again.';
  }

  if (message.includes('email not confirmed')) {
    return 'Please confirm your email before logging in.';
  }

  if (message.includes('already registered') || message.includes('user already registered')) {
    return 'This email is already registered. Try logging in instead.';
  }

  if (message.includes('password') && (message.includes('weak') || message.includes('least') || message.includes('short'))) {
    return 'Password is too weak. Use at least 6 characters with a mix of letters, numbers, and symbols.';
  }

  if (message.includes('password should be at least')) {
    return 'Password is too short. Please use a longer password.';
  }

  if (message.includes('invalid email') || message.includes('email address is invalid')) {
    return 'Please enter a valid email address.';
  }

  if (message.includes('too many requests') || message.includes('rate limit')) {
    return action === 'login'
      ? 'Too many login attempts. Please wait and try again.'
      : 'Too many signup attempts. Please wait and try again.';
  }

  if (message.includes('network') || message.includes('failed to fetch') || message.includes('fetch')) {
    return 'Network error. Check your internet connection and try again.';
  }

  return rawMessage || (action === 'login'
    ? 'Unable to log in right now. Please try again.'
    : 'Unable to create your account right now. Please try again.');
};

export async function runAuthRequest({
  action,
  request,
  setLoading,
  setErrorMessage,
  onSuccess,
}: AuthRequestOptions) {
  setLoading(true);

  try {
    const { data, error } = await request();

    if (error) {
      setErrorMessage(getAuthErrorMessage(action, error.message));
      return false;
    }

    onSuccess(data);
    return true;
  } catch (error) {
    const fallbackMessage = error instanceof Error ? error.message : 'Unknown error.';
    setErrorMessage(getAuthErrorMessage(action, fallbackMessage));
    return false;
  } finally {
    setLoading(false);
  }
}