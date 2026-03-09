import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBm2_d4stfbDp7ZuLF7k3BmX6EPsPk3ZEE",
  authDomain: "planner-semanal-7.firebaseapp.com",
  projectId: "planner-semanal-7",
  storageBucket: "planner-semanal-7.firebasestorage.app",
  messagingSenderId: "361728306610",
  appId: "1:361728306610:web:dc260ad776d63637b888ab"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function firebaseSignOut() {
  await signOut(auth);
}

const storage = {
  async get(key) {
    // Firestore é sempre a fonte da verdade.
    // localStorage só é usado se o Firestore for genuinamente inacessível (offline).
    try {
      const docRef = doc(db, 'storage', key);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const { value, updatedAt } = docSnap.data();
        console.log('[storage] ✅ Firestore get OK:', key);
        // Sincroniza cache local com o valor mais recente do Firestore
        try {
          localStorage.setItem(key, value);
          localStorage.setItem(key + '__meta', JSON.stringify({ updatedAt }));
        } catch {}
        return { key, value };
      }
      // Documento não existe no Firestore — remove cache local desatualizado
      try { localStorage.removeItem(key); localStorage.removeItem(key + '__meta'); } catch {}
      throw new Error("not found");
    } catch (e) {
      if (e.message === "not found") throw e;
      // Erro de rede/Firestore — usa localStorage como fallback offline
      try {
        const val = localStorage.getItem(key);
        if (val !== null) return { key, value: val };
      } catch {}
      throw new Error("not found");
    }
  },

  async set(key, value) {
    const updatedAt = new Date().toISOString();
    try {
      const docRef = doc(db, 'storage', key);
      await setDoc(docRef, { value, updatedAt });
      console.log('[storage] ✅ Firestore set OK:', key);
      // Só atualiza localStorage após confirmação do Firestore
      try {
        localStorage.setItem(key, value);
        localStorage.setItem(key + '__meta', JSON.stringify({ updatedAt }));
      } catch {}
      return { key, value };
    } catch (e) {
      console.error('[storage] ❌ Firestore set FAILED:', key, e.code, e.message);
      // Offline: salva localmente com flag de sync pendente
      try {
        localStorage.setItem(key, value);
        localStorage.setItem(key + '__meta', JSON.stringify({ updatedAt, pendingSync: true }));
      } catch {}
      return { key, value };
    }
  },

  async delete(key) {
    try {
      const docRef = doc(db, 'storage', key);
      await deleteDoc(docRef);
      try { localStorage.removeItem(key); localStorage.removeItem(key + '__meta'); } catch {}
      return { key, deleted: true };
    } catch {
      try { localStorage.removeItem(key); localStorage.removeItem(key + '__meta'); } catch {}
      return { key, deleted: true };
    }
  },

  async list(prefix) {
    try {
      const colRef = collection(db, 'storage');
      const snapshot = await getDocs(colRef);
      const keys = [];
      snapshot.forEach(d => {
        if (!prefix || d.id.startsWith(prefix)) keys.push(d.id);
      });
      return { keys };
    } catch {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !k.endsWith('__meta') && (!prefix || k.startsWith(prefix))) keys.push(k);
      }
      return { keys };
    }
  }
};

if (typeof window !== 'undefined') {
  window.storage = storage;
}

export default storage;
