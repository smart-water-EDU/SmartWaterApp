import {prepareHeatDesign} from './heat-recovery-model.js';
export const HEAT_DESIGN_STORAGE_KEY='smart-drops-heat-recovery-design-v1';
export function loadHeatDesign(storage=globalThis.localStorage){const text=storage.getItem(HEAT_DESIGN_STORAGE_KEY);return text?JSON.parse(text):null;}
export function saveHeatDesign(design,catalog,storage=globalThis.localStorage){const saved=prepareHeatDesign(design,catalog);storage.setItem(HEAT_DESIGN_STORAGE_KEY,JSON.stringify(saved));return saved;}
