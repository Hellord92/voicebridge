/**
 * Firebase client for Electron renderer process.
 * Google sign-in uses signInWithPopup — works fine in Electron's renderer.
 * After sign-in, the idToken is sent to the backend via IPC.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID              ?? '',
};

const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(firebaseApp);

/**
 * Sign in with Google and call backend /api/auth/me.
 * Returns { ok, user, account } or { ok: false, error }.
 */
export async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();

    // Send token to backend
    const accountResp = await window.vb.firebasePostLogin(idToken);

    const userData = {
      uid:     result.user.uid,
      email:   result.user.email,
      name:    result.user.displayName,
      idToken,
      account: accountResp.data,
    };

    // Persist to electron-store
    await window.vb.saveFirebaseUser(userData);

    return { ok: true, user: userData, account: accountResp.data };
  } catch (e) {
    console.error('[firebase] signInWithGoogle error:', e);
    return { ok: false, error: e.message || 'Sign-in failed' };
  }
}

export async function signOut() {
  await fbSignOut(auth);
  await window.vb.signOut();
}
