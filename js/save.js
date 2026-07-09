/**
 * Система сохранения прогресса (localStorage)
 */

const SAVE_KEY = 'temple_escape_save';
const SAVE_VERSION = 1;

const Save = {
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== SAVE_VERSION) return null;
      return data;
    } catch {
      return null;
    }
  },

  write(data) {
    try {
      const payload = {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        ...data,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  },

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },

  hasContinue() {
    const data = this.load();
    if (!data || data.gameCompleted) return false;
    return typeof data.nextLevelIndex === 'number'
      && data.nextLevelIndex >= 0
      && data.nextLevelIndex < LEVELS.length;
  },
};
