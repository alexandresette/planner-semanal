import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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

// Auth anônima: garante que todas as requisições ao Firestore tenham um token válido.
// As Firestore Security Rules exigem request.auth != null — isso bloqueia acesso
// direto via curl/API mas não expõe identidade do usuário.
// Se o login anônimo falhar (rede, ou sign-up desligado no Console), ensureAuth()
// tenta de novo a cada 10s nas próximas chamadas, para a aba se recuperar sozinha.
const _authReadyPromise = new Promise(resolve => {
  onAuthStateChanged(auth, user => {
    if (user) {
      resolve();
    } else {
      signInAnonymously(auth).catch(e => {
        console.warn('[storage] signInAnonymously falhou:', e.code);
        resolve(); // continuar mesmo sem auth (fallback local)
      });
    }
  });
});

let _lastAuthRetry = 0;
async function ensureAuth() {
  await _authReadyPromise;
  if (auth.currentUser) return;
  const now = Date.now();
  if (now - _lastAuthRetry < 10000) return;
  _lastAuthRetry = now;
  try {
    await signInAnonymously(auth);
    console.log('[storage] login anônimo recuperado');
  } catch (e) {
    console.warn('[storage] nova tentativa de login anônimo falhou:', e.code);
  }
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function firebaseSignOut() {
  await signOut(auth);
}


export async function callSendResetEmail(email, resetUrl) {
  const url = "https://southamerica-east1-planner-semanal-7.cloudfunctions.net/sendResetEmail";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, resetUrl }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao enviar e-mail.");
  }
  return response.json();
}
export async function callSendInviteEmail(email) {
  const url = "https://sendinviteemail-32r6mebf5q-rj.a.run.app";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao enviar e-mail.");
  }
  return response.json();
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
