/**
 * Firebase client for Electron renderer.
 * Lazy-init so missing .env.local does not crash the app on import.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';

let auth = null;

function firebaseConfigured() {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);
}

function getAuthInstance() {
  if (auth) return auth;
  if (!firebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Copy app/.env.example to app/.env.local and add your Firebase web app keys.'
    );
  }
  const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  };
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  return auth;
}

export { firebaseConfigured };

export async function refreshIdToken() {
  try {
    const a = getAuthInstance();
    if (!a.currentUser) return null;
    return await a.currentUser.getIdToken(/* forceRefresh */ true);
  } catch (e) {
    console.warn('[firebase] refreshIdToken failed:', e.message);
    return null;
  }
}

export async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(getAuthInstance(), provider);
    const idToken = await result.user.getIdToken();

    const accountResp = await window.vb.firebasePostLogin(idToken);
    if (!accountResp.ok) {
      return { ok: false, error: accountResp.error || accountResp.data?.detail || 'Could not load account' };
    }

    const userData = {
      uid:          result.user.uid,
      email:        result.user.email,
      name:         result.user.displayName,
      idToken,
      refreshToken: result.user.refreshToken,
      firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      tokenExpiry:  Date.now() + 3500 * 1000,
      account:      accountResp.data,
    };

    await window.vb.saveFirebaseUser(userData);

    return { ok: true, user: userData, account: accountResp.data };
  } catch (e) {
    console.error('[firebase] signInWithGoogle error:', e);
    return { ok: false, error: e.message || 'Sign-in failed' };
  }
}

export async function signOut() {
  if (auth) await fbSignOut(auth);
  await window.vb.signOut();
}
