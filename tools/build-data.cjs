// Refresh the browser-friendly data script and CSV exports from the editable JSON source files.
// Uses only Node.js built-ins: no npm install, package manager, or external module is required.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const publicDataDir = path.join(root, 'public', 'data');
fs.mkdirSync(publicDataDir, { recursive: true });
const read = file => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
const building = read('building.json');
const profiles = read('retrofit_consumption_profiles.json');
const monitoring = read('monitoring_2026.json');

function cell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csv(headers, rows) {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
function write(name, headers, rows) {
  fs.writeFileSync(path.join(dataDir, name), csv(headers, rows), 'utf8');
}

write('building_floors.csv',
  ['floor_id', 'gross_area_m2', 'common_area_m2', 'tenant_area_m2', 'module_count', 'color', 'section_x', 'section_y', 'section_width', 'section_height'],
  building.floors.map(f => [f.id, f.grossAreaM2, f.commonAreaM2, f.grossAreaM2 - f.commonAreaM2, f.modules.length, f.color, f.geometry.x, f.geometry.y, f.geometry.width, f.geometry.height]));
const modules = building.floors.flatMap(f => f.modules.map(m => ({ ...m, floorId: f.id })));
write('building_modules.csv',
  ['module_id', 'floor_id', 'area_m2', 'tenant_use', 'section_x', 'section_y', 'section_width', 'section_height'],
  modules.map(m => [m.id, m.floorId, m.areaM2, m.use, m.geometry.x, m.geometry.y, m.geometry.width, m.geometry.height]));

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hours = Array.from({ length: 24 }, (_, hour) => `hour_${String(hour).padStart(2, '0')}_weight`);
const profileHeaders = ['profile_id', 'label', 'specific_consumption_l_m2_operating_day', 'opening_start_hour', 'opening_end_hour',
  ...weekdays.map(day => `adjustment_${day.toLowerCase()}`), 'peak_factor', 'assumptions', 'notes', ...hours];
write('consumption_profiles.csv', profileHeaders,
  profiles.profiles.map(profile => [profile.id, profile.label, profile.specificConsumption, ...profile.openingHours,
    ...profile.weekdayAdjustment, profile.peakFactor, profile.assumptions, profile.notes, ...profile.hourlyWeights]));

const hourlyHeaders = ['timestamp_utc', ...monitoring.columns.map(column => column.id)];
const start = Date.parse(monitoring.start);
write('monitoring_2026.csv', hourlyHeaders,
  monitoring.rows.map((row, index) => [new Date(start + index * monitoring.periodMinutes * 60000).toISOString(), ...row]));
write('leak_events.csv', ['event_id', 'name', 'start_utc', 'end_utc', 'leak_l_min', 'event_type', 'segment'],
  monitoring.events.map(event => [event.id, event.name, event.start, event.end, event.leakLMin, event.type, event.segment]));

const browserData = { building, profiles, monitoring };
fs.writeFileSync(path.join(publicDataDir, 'datasets.js'),
  `/* Generated from the adjacent JSON files by node tools/build-data.cjs. */\nwindow.SMART_DROPS_DATA = ${JSON.stringify(browserData)};\n`, 'utf8');
console.log('Updated public/data/datasets.js and 5 CSV files from the JSON source datasets.');
