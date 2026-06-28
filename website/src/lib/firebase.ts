'use client';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? '',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? '',
};

// Firebase must only be initialised in the browser — it uses browser APIs
// (IndexedDB, fetch, etc.) that do not exist in the Node.js SSR environment.
function getFirebaseApp(): FirebaseApp {
  if (getApps().length) return getApps()[0];
  return initializeApp(firebaseConfig);
}

// Export a getter so modules that import this file don't trigger initialisation
// at module-evaluation time (which runs on the server during prerender).
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

// Lazy singleton – only accessed in browser via 'use client' components
export default getFirebaseApp;
