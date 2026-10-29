/** STUDENT EXTENSION: local editor drafts, separate from active monitoring. */
const KEY = 'smart-drops-retrofit-editor-draft-v1';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SmartDropsRetrofitDrafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function indexed(operation, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', operation === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('drafts');
      const request = operation === 'get' ? store.get(KEY)
        : operation === 'delete' ? store.delete(KEY) : store.put(value, KEY);
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(result ?? null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Draft save was interrupted.'));
    });
  } finally { db.close(); }
}

export async function loadRetrofitDraft() {
  if (globalThis.indexedDB) {
    try { const saved = await indexed('get'); if (saved) return saved; }
    catch (error) { console.info('Editor draft storage fallback.', error); }
  }
  const raw = globalThis.localStorage?.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveRetrofitDraft(value) {
  const record = { ...structuredClone(value), schemaVersion: 1, updatedAt: new Date().toISOString() };
  if (globalThis.indexedDB) {
    try { await indexed('put', record); return record; }
    catch (error) { console.info('Editor draft storage fallback.', error); }
  }
  if (!globalThis.localStorage) throw new Error('Local draft storage is unavailable.');
  localStorage.setItem(KEY, JSON.stringify(record));
  return record;
}

export async function clearRetrofitDraft() {
  if (globalThis.indexedDB) {
    try { await indexed('delete'); }
    catch (error) { console.info('Could not clear indexed editor draft.', error); }
  }
  globalThis.localStorage?.removeItem(KEY);
}
