'use client';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

// Firebase web API keys are designed to be public (security is via Firebase Rules).
// Environment variables override these defaults when set in Vercel/production.
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? 'AIzaSyB3i-MYV4CffWc1QU_GwWVNZVgYr1ZN5TA',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? 'voicebridge-prod-8aeab.firebaseapp.com',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? 'voicebridge-prod-8aeab',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? 'voicebridge-prod-8aeab.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '221493239298',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? '1:221493239298:web:51f07f414ade1ba521511b',
};

const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseReady) return null;
  try {
    if (getApps().length) return getApps()[0];
    return initializeApp(firebaseConfig);
  } catch {
    return null;
  }
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    return getAuth(app);
  } catch {
    return null;
  }
}

export { firebaseReady };
export default getFirebaseApp;
