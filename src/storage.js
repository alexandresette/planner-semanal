import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyBm2_d4stfbDp7ZulF7k3BmX6EPsPk3ZEE",
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
const functions = getFunctions(app, 'southamerica-east1');

// Identidade: o login é conferido no servidor (Cloud Functions), que devolve um
// custom token com uid = username. As regras do Firestore usam esse uid para
// liberar só as chaves do próprio usuário (admin tem claim "admin").
// Sem login não há acesso ao Firestore; as leituras caem no cache local.
const _authReadyPromise = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, () => { unsub(); resolve(); });
});

export function authReady() {
  return _authReadyPromise;
}

async function ensureAuth() {
  await _authReadyPromise;
}

// uid do Firebase Auth atual (username depois do login), ou null
export function currentUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

export async function signInWithServerToken(token) {
  await signInWithCustomToken(auth, token);
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function firebaseSignOut() {
  await signOut(auth);
}

// Chama uma Cloud Function callable e devolve o resultado; erros viram Error com .code
export async function callFn(name, data = {}) {
  try {
    const res = await httpsCallable(functions, name)(data);
    return res.data;
  } catch (e) {
    const err = new Error(e.message || 'Falha na operação.');
    err.code = (e.code || '').replace('functions/', '');
    throw err;
  }
}

// Metadados do cache local: { updatedAt, baseUpdatedAt?, pendingSync? }
// baseUpdatedAt = updatedAt do Firestore sobre o qual a cópia local foi construída.
// Uma pendência só sobe sozinha se o Firestore não mudou desde essa base;
// caso contrário vira backup no Firestore (backup-<chave>-<timestamp>) e o remoto vence.
function readMeta(key) {
  try { return JSON.parse(localStorage.getItem(key + '__meta') || '{}') || {}; } catch { return {}; }
}
function writeMeta(key, meta) {
  try { localStorage.setItem(key + '__meta', JSON.stringify(meta)); } catch {}
}

async function backupPending(key, value, meta) {
  const ts = Date.now();
  try { localStorage.setItem(`${key}__backup_${ts}`, value); } catch {}
  try {
    await setDoc(doc(db, 'storage', `backup-${key}-${ts}`), {
      value, updatedAt: new Date(ts).toISOString(), localUpdatedAt: meta.updatedAt || null,
    });
    console.warn('[storage] pendência local guardada como backup:', `backup-${key}-${ts}`);
  } catch (e) {
    console.error('[storage] falha ao guardar backup da pendência:', key, e.code);
  }
}

const storage = {
  async get(key) {
    await ensureAuth();
    try {
      const docRef = doc(db, 'storage', key);
      const docSnap = await getDoc(docRef);
      const remote = docSnap.exists() ? docSnap.data() : null;

      // Pendência local (gravação que falhou antes): decide se sobe ou vira backup
      const meta = readMeta(key);
      let local = null;
      try { local = localStorage.getItem(key); } catch {}
      if (meta.pendingSync && local !== null && (!remote || local !== remote.value)) {
        const remoteUnchanged = remote && meta.baseUpdatedAt && meta.baseUpdatedAt === remote.updatedAt;
        if (remoteUnchanged) {
          console.log('[storage] enviando pendência local:', key);
          await storage.set(key, local);
          return { key, value: local };
        }
        await backupPending(key, local, meta);
      }

      if (remote) {
        const { value, updatedAt } = remote;
        console.log('[storage] ✅ Firestore get OK:', key);
        // Sincroniza cache local com o valor mais recente do Firestore
        try { localStorage.setItem(key, value); } catch {}
        writeMeta(key, { updatedAt, baseUpdatedAt: updatedAt });
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
    await ensureAuth();
    const updatedAt = new Date().toISOString();
    const prev = readMeta(key);
    try {
      const docRef = doc(db, 'storage', key);
      await setDoc(docRef, { value, updatedAt });
      console.log('[storage] ✅ Firestore set OK:', key);
      // Só atualiza localStorage após confirmação do Firestore
      try { localStorage.setItem(key, value); } catch {}
      writeMeta(key, { updatedAt, baseUpdatedAt: updatedAt });
      return { key, value };
    } catch (e) {
      console.error('[storage] ❌ Firestore set FAILED:', key, e.code, e.message);
      // Offline: salva localmente com flag de sync pendente, preservando a base remota conhecida
      const baseUpdatedAt = prev.pendingSync ? prev.baseUpdatedAt : (prev.baseUpdatedAt || prev.updatedAt);
      try { localStorage.setItem(key, value); } catch {}
      writeMeta(key, { updatedAt, pendingSync: true, baseUpdatedAt });
      return { key, value };
    }
  },

  async delete(key) {
    await ensureAuth();
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
    await ensureAuth();
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
