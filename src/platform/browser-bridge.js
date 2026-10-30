/* Browser equivalents of the former Electron preload API. No Node.js access. */
(() => {
  const files = {
    'building.json': 'building',
    'retrofit_consumption_profiles.json': 'profiles',
    'data_manifest.json': 'monitoring'
  };
  const storageKey = 'smart-drops-water-manager-settings-v1';
  const customMonitoringKey = 'smart-drops-custom-monitoring-v1';
  let memorySettings = {}, memoryCustomMonitoring = null;
  function openDataStore(){
    if(!window.indexedDB)return Promise.reject(new Error('IndexedDB unavailable'));
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('SmartDropsLocalData',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('datasets'))request.result.createObjectStore('datasets');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }
  async function loadCustomMonitoring(){
    if(memoryCustomMonitoring)return memoryCustomMonitoring;
    try{const db=await openDataStore();const value=await new Promise((resolve,reject)=>{const request=db.transaction('datasets','readonly').objectStore('datasets').get('monitoring');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});db.close();if(value){memoryCustomMonitoring=value;return value;}}catch(error){console.info('Using browser storage fallback for custom monitoring data.',error);}
    try{const saved=localStorage.getItem(customMonitoringKey);if(saved)memoryCustomMonitoring=JSON.parse(saved);}catch(error){console.info('Custom monitoring data is available only for this session.',error);}
    return memoryCustomMonitoring;
  }
  async function saveCustomMonitoring(value){
    memoryCustomMonitoring=value;
    try{const db=await openDataStore();await new Promise((resolve,reject)=>{const tx=db.transaction('datasets','readwrite');tx.objectStore('datasets').put(value,'monitoring');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();return true;}catch(error){console.info('IndexedDB save failed; trying browser storage.',error);}
    try{localStorage.setItem(customMonitoringKey,JSON.stringify(value));return true;}catch(error){throw new Error('The browser could not store this dataset locally. '+error.message);}
  }
  async function resetCustomMonitoring(){
    memoryCustomMonitoring=null;
    try{const db=await openDataStore();await new Promise((resolve,reject)=>{const tx=db.transaction('datasets','readwrite');tx.objectStore('datasets').delete('monitoring');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch(error){console.info('Could not remove the IndexedDB copy.',error);}
    try{localStorage.removeItem(customMonitoringKey);}catch(error){console.info('Could not remove the browser storage copy.',error);}
    return true;
  }

  // Fullscreen the outer viewport so the 1920 × 1080 frame keeps its aspect ratio.
  function fullscreenSurface() {
    try {
      if (window.frameElement) {
        const outerDocument = window.frameElement.ownerDocument;
        return { document: outerDocument, element: outerDocument.documentElement };
      }
    } catch (error) { /* Standalone app.html still supports fullscreen. */ }
    return { document, element: document.documentElement };
  }
  window.waterAPI = Object.freeze({
    readData(name) {
      const key = files[name];
      if (!key || !window.SMART_DROPS_DATA?.[key]) return Promise.reject(new Error(`Unknown local dataset: ${name}`));
      return Promise.resolve(window.SMART_DROPS_DATA[key]);
    },
    loadCustomMonitoring,
    saveCustomMonitoring,
    resetCustomMonitoring,
    async loadSettings() {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) memorySettings = JSON.parse(saved);
      } catch (error) {
        console.info('Browser storage is unavailable for this file origin; settings remain for this session.', error);
      }
      return memorySettings;
    },
    async saveSettings(value) {
      memorySettings = value;
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch (error) {
        console.info('Browser storage is unavailable for this file origin; settings remain for this session.', error);
      }
      return true;
    },
    async getFullscreen() {
      const target = fullscreenSurface();
      return target.document.fullscreenElement === target.element;
    },
    async toggleFullscreen() {
      const target = fullscreenSurface();
      if (target.document.fullscreenElement) {
        await target.document.exitFullscreen();
        return false;
      }
      await target.element.requestFullscreen();
      return true;
    },
    async setFullscreen(enabled) {
      const target = fullscreenSurface();
      if (enabled && !target.document.fullscreenElement) await target.element.requestFullscreen();
      if (!enabled && target.document.fullscreenElement) await target.document.exitFullscreen();
      return target.document.fullscreenElement === target.element;
    },
    onFullscreenChange(callback) {
      fullscreenSurface().document.addEventListener('fullscreenchange', callback);
    }
  });
})();
