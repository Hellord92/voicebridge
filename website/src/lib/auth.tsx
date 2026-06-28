'use client';
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.voicebridgeapps.com';

interface AccountLicense {
  key: string;
  plan_id: string;
  plan_name: string;
  minutes_total: number;
  minutes_used: number;
  minutes_left: number | null;
  free_trial: boolean;
  active: boolean;
}

interface Account {
  uid: string;
  email: string;
  name: string | null;
  license: AccountLicense;
}

interface AuthCtx {
  user:           User | null;
  account:        Account | null;
  loading:        boolean;
  signInGoogle:   () => Promise<void>;
  signOut:        () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccount = useCallback(async (u: User) => {
    try {
      const idToken = await u.getIdToken();
      const res = await fetch(`${API}/api/auth/me`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) setAccount(await res.json());
    } catch (e) {
      console.error('[auth] fetchAccount error:', e);
    }
  }, []);

  useEffect(() => {
    // getFirebaseAuth() is only called inside useEffect → runs in browser only
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) await fetchAccount(u);
      else    setAccount(null);
      setLoading(false);
    });
    return unsub;
  }, [fetchAccount]);

  const signInGoogle = async () => {
    const auth     = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    await fetchAccount(result.user);
  };

  const signOut = async () => {
    await fbSignOut(getFirebaseAuth());
    setAccount(null);
  };

  const refreshAccount = useCallback(async () => {
    if (user) await fetchAccount(user);
  }, [user, fetchAccount]);

  return (
    <Ctx.Provider value={{ user, account, loading, signInGoogle, signOut, refreshAccount }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
