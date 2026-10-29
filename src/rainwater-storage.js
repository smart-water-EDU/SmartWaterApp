import {prepareRainwaterDesign} from './rainwater-model.js';
export const RAIN_DESIGN_STORAGE_KEY='smart-drops-rainwater-design-v1';
export function loadRainwaterDesign(storage=globalThis.localStorage){const value=storage.getItem(RAIN_DESIGN_STORAGE_KEY);return value?JSON.parse(value):null;}
export function saveRainwaterDesign(design,catalog,storage=globalThis.localStorage){const saved=prepareRainwaterDesign(design,catalog);storage.setItem(RAIN_DESIGN_STORAGE_KEY,JSON.stringify(saved));return saved;}
