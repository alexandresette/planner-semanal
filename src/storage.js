// Storage adapter - uses localStorage for standalone deployment
const storage = {
  async get(key) {
    try {
      const val = localStorage.getItem(key);
      if (val === null) throw new Error("not found");
      return { key, value: val };
    } catch {
      throw new Error("not found");
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch {
      return null;
    }
  },
  async delete(key) {
    try {
      localStorage.removeItem(key);
      return { key, deleted: true };
    } catch {
      return null;
    }
  },
  async list(prefix) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!prefix || k.startsWith(prefix)) keys.push(k);
    }
    return { keys };
  }
};

// Make it available globally like Claude's storage API
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = storage;
}

export default storage;
