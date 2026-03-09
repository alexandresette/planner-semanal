import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

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

const storage = {
  async get(key) {
    try {
      const docRef = doc(db, 'storage', key);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { key, value: docSnap.data().value };
      }
      throw new Error("not found");
    } catch (e) {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) return { key, value: val };
      } catch {}
      throw new Error("not found");
    }
  },

  async set(key, value) {
    try {
      const docRef = doc(db, 'storage', key);
      await setDoc(docRef, { value, updatedAt: new Date().toISOString() });
      try { localStorage.setItem(key, value); } catch {}
      return { key, value };
    } catch (e) {
      try { localStorage.setItem(key, value); } catch {}
      return { key, value };
    }
  },

  async delete(key) {
    try {
      const docRef = doc(db, 'storage', key);
      await deleteDoc(docRef);
      try { localStorage.removeItem(key); } catch {}
      return { key, deleted: true };
    } catch {
      try { localStorage.removeItem(key); } catch {}
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
        if (!prefix || k.startsWith(prefix)) keys.push(k);
      }
      return { keys };
    }
  }
};

if (typeof window !== 'undefined') {
  window.storage = storage;
}

export default storage;
