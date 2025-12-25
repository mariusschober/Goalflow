const CURRENT_USER_KEY = 'goalflow_currentUser';
const USER_LOGIN_CODE_KEY = 'goalflow_loginCode';

// In a real app, this would be a secure, server-side process.
// For this simulation, we use a static demo code.
export const loginWithEmail = (email: string): void => {
  if (!email || !email.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  
  // Store the email being used for login to verify against in the next step.
  const loginData = { email };
  localStorage.setItem(USER_LOGIN_CODE_KEY, JSON.stringify(loginData));

  // In a real app, a code would be emailed. Here we just proceed to the next step.
};

export const verifyCode = (email: string, code: string): boolean => {
  const loginDataStr = localStorage.getItem(USER_LOGIN_CODE_KEY);
  if (!loginDataStr) {
    return false;
  }
  
  const loginData = JSON.parse(loginDataStr);
  
  // Check if code is for the right email and matches the static demo code.
  if (loginData.email === email && code === '123456') {
    // Success! Create a "session" by storing the current user's email.
    localStorage.setItem(CURRENT_USER_KEY, email);
    localStorage.removeItem(USER_LOGIN_CODE_KEY); // Clean up the used code
    return true;
  }

  return false;
};

export const getCurrentUser = (): string | null => {
  return localStorage.getItem(CURRENT_USER_KEY);
};

export const logout = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};
