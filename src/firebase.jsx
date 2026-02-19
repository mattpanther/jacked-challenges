import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  linkWithCredential,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

// --- Firebase Configuration (reused from 10×400 project) ---
const firebaseConfig = {
  apiKey: 'AIzaSyA_ajqyKXXOiKeHa3oc7QpMn9h3jO7WhJ8',
  authDomain: 'jacked-10by400.firebaseapp.com',
  projectId: 'jacked-10by400',
  storageBucket: 'jacked-10by400.firebasestorage.app',
  messagingSenderId: '670451147396',
  appId: '1:670451147396:web:d9aaaf663aa227142898d1',
};

const GOOGLE_CLIENT_ID =
  '670451147396-b7rv5vtuk5bidobn6qlddnj2erq51e0b.apps.googleusercontent.com';

const APP_ID = 'public-tracker';

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Auth Context ---
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setAuthError(null);
        setLoading(false);
      } else {
        // Try anonymous sign-in (non-blocking)
        signInAnonymously(auth).catch((err) => {
          console.warn('[Auth] Anonymous sign-in failed (app works offline):', err.message);
          setAuthError(err.message);
          setUser(null);
          setLoading(false);
        });
      }
    }, (error) => {
      // onAuthStateChanged error handler
      console.warn('[Auth] Auth state listener error:', error.message);
      setAuthError(error.message);
      setUser(null);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (window.location.protocol === 'file:') {
      alert('Google Sign-In requires serving from localhost or a deployed URL.');
      return;
    }
    if (typeof google === 'undefined' || !google.accounts) {
      console.error('[Auth] GIS SDK not loaded');
      return;
    }

    return new Promise((resolve, reject) => {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const credential = GoogleAuthProvider.credential(response.credential);
            if (auth.currentUser?.isAnonymous) {
              try {
                const result = await linkWithCredential(auth.currentUser, credential);
                resolve(result.user);
              } catch (linkError) {
                if (linkError.code === 'auth/credential-already-in-use') {
                  const result = await signInWithCredential(auth, credential);
                  resolve(result.user);
                } else {
                  throw linkError;
                }
              }
            } else {
              const result = await signInWithCredential(auth, credential);
              resolve(result.user);
            }
          } catch (error) {
            console.error('[Auth] Google Auth Error:', error);
            reject(error);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
      });

      // Render button in a modal overlay
      const existing = document.getElementById('gsi-button-container');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'gsi-button-container';
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;';
      overlay.innerHTML = `
        <div style="background:#111;border:1px solid #333;border-radius:12px;padding:24px;text-align:center;max-width:320px;width:100%;margin:16px;">
          <p style="color:#aaa;font-size:14px;margin-bottom:16px;">Sign in with your Google account</p>
          <div id="gsi-button" style="display:flex;justify-content:center;"></div>
          <button id="gsi-cancel" style="margin-top:16px;color:#666;font-size:12px;text-decoration:underline;background:none;border:none;cursor:pointer;">Cancel</button>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });
      document.getElementById('gsi-cancel')?.addEventListener('click', () => overlay.remove());

      google.accounts.id.renderButton(document.getElementById('gsi-button'), {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        width: 250,
      });
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.disableAutoSelect();
      }
      await auth.signOut();
      await signInAnonymously(auth);
    } catch (error) {
      console.error('[Auth] Sign out error', error);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, authError, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// --- Firestore Helpers ---

function getDocPath(challengeId) {
  const userId = auth.currentUser?.uid;
  if (!userId) return null;
  return `artifacts/${APP_ID}/users/${userId}/jacked-challenge/${challengeId}`;
}

/**
 * Save state to Firestore
 */
export async function saveState(challengeId, data) {
  const path = getDocPath(challengeId);
  if (!path) return;
  try {
    await setDoc(doc(db, path), data, { merge: true });
  } catch (err) {
    console.error('[Firestore] Save error:', err);
  }
}

/**
 * Subscribe to real-time state updates. Returns unsubscribe fn.
 */
export function subscribeToState(challengeId, callback) {
  const path = getDocPath(challengeId);
  if (!path) return () => {};
  return onSnapshot(
    doc(db, path),
    (snap) => {
      if (snap.exists()) {
        callback(snap.data());
      } else {
        callback(null);
      }
    },
    (err) => {
      console.error('[Firestore] Snapshot error:', err);
    }
  );
}

/**
 * React hook for Firestore-backed challenge state.
 * Returns [state, setState] — setState also persists to Firestore.
 */
export function useChallengeState(challengeId, defaultState) {
  const { user, loading } = useAuth();
  const [state, setStateLocal] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef(null);

  // Subscribe to Firestore (only when logged in)
  useEffect(() => {
    if (loading) return;
    if (!user) {
      // No auth — work in local-only mode
      setLoaded(true);
      return;
    }
    const unsub = subscribeToState(challengeId, (data) => {
      if (data) {
        setStateLocal((prev) => ({ ...prev, ...data }));
      }
      setLoaded(true);
    });
    return unsub;
  }, [user, loading, challengeId]);

  // Debounced save
  const setState = useCallback(
    (updater) => {
      setStateLocal((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        // Only persist if signed in
        if (user) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            saveState(challengeId, next);
          }, 1000);
        }
        return next;
      });
    },
    [challengeId, user]
  );

  return [state, setState, loaded];
}

export { auth, db };
