import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetrofitDraft, saveRetrofitDraft, clearRetrofitDraft} from '../src/retrofit-draft-storage.js';

test('local drafts preserve imported loads and virtual sensors independently of active data', async () => {
  const previous = globalThis.localStorage, memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key)
  };
  try {
    assert.equal(await loadRetrofitDraft(), null);
    const draft = {
      moduleIds: ['L1-01'], selected: 'L1-01',
      changes: {'L1-01': {use: 'restaurant', importedRows: [[12, 3]], notes: 'Study this unit'}},
      sensors: [{id: 'V-F-L1-01', module: 'L1-01', type: 'flow'}]
    };
    const before = structuredClone(draft);
    const saved = await saveRetrofitDraft(draft);
    draft.changes['L1-01'].importedRows[0][0] = 99;
    const restored = await loadRetrofitDraft();
    assert.equal(restored.schemaVersion, 1);
    assert.equal(Number.isFinite(Date.parse(restored.updatedAt)), true);
    assert.deepEqual(restored.changes, before.changes);
    assert.deepEqual(restored.sensors, before.sensors);
    saved.sensors[0].id = 'mutated';
    assert.deepEqual((await loadRetrofitDraft()).sensors, before.sensors);
    await clearRetrofitDraft();
    assert.equal(await loadRetrofitDraft(), null);
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});

test('failed local draft saves report storage failure', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {setItem() { throw new Error('Storage quota exceeded'); }};
  try { await assert.rejects(saveRetrofitDraft({changes: {}}), /quota exceeded/); }
  finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
