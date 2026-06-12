export const STORAGE_KEYS = {
  personas: 'personas',
  settings: 'settings',
  activePersonaId: 'activePersonaId',
  desiredPersonaId: 'desiredPersonaId',
  lastValidation: 'lastValidation'
} as const;

type StorageArea = chrome.storage.StorageArea;

export function storageGet<T extends Record<string, unknown>>(area: StorageArea, keys?: string[] | string | Record<string, unknown>): Promise<Partial<T>> {
  return new Promise((resolve, reject) => {
    area.get(keys ?? null, (items) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(items as Partial<T>);
    });
  });
}

export function storageSet(area: StorageArea, items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    area.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

export function storageRemove(area: StorageArea, keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    area.remove(keys, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

export function sessionArea(): StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}
