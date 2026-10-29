import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadJson = async name => JSON.parse(await readFile(resolve(root, 'data', name), 'utf8'));

test('building and profile assumptions are complete and internally consistent', async () => {
  const [building, profiles] = await Promise.all([
    loadJson('building.json'),
    loadJson('retrofit_consumption_profiles.json')
  ]);
  assert.equal(building.floors.length, 7);
  assert.equal(building.floors.reduce((sum, floor) => sum + floor.modules.length, 0), 35);
  assert.equal(building.floors.reduce((sum, floor) => sum + floor.grossAreaM2, 0), 16000);
  assert.ok(profiles.profiles.length > 0);
  for (const profile of profiles.profiles) {
    assert.equal(profile.hourlyWeights.length, 24, `${profile.id} has 24 hourly weights`);
    assert.ok(Math.abs(profile.hourlyWeights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9,
      `${profile.id} hourly weights sum to 1`);
  }
});

test('2026 baseline has 8,760 periods and reconciles every demand and floor meter', async () => {
  const [building, monitoring] = await Promise.all([
    loadJson('building.json'),
    loadJson('monitoring_2026.json')
  ]);
  assert.equal(monitoring.periods, 8760);
  assert.equal(monitoring.rows.length, 8760);
  const columnIndex = new Map(monitoring.columns.map((column, index) => [column.id, index]));
  const demand = monitoring.columns
    .map((column, index) => ({ ...column, index }))
    .filter(column => column.use !== 'meter' && column.use !== 'leak');
  const leakIndex = columnIndex.get('LEAK');
  const mainIndex = columnIndex.get('MAIN');
  const outletIndex = columnIndex.get('OUTLET');
  assert.ok([leakIndex, mainIndex, outletIndex].every(Number.isInteger));

  for (const [period, row] of monitoring.rows.entries()) {
    assert.equal(row.length, monitoring.columns.length, `period ${period} channel count`);
    const outlet = demand.reduce((sum, column) => sum + row[column.index], 0);
    assert.equal(outlet, row[outletIndex], `period ${period} demand equals outlet`);
    assert.equal(row[mainIndex], row[outletIndex] + row[leakIndex], `period ${period} main balance`);
    for (const floor of building.floors) {
      const floorDemand = demand
        .filter(column => column.floor === floor.id)
        .reduce((sum, column) => sum + row[column.index], 0);
      assert.equal(row[columnIndex.get(`M-${floor.id}`)], floorDemand,
        `period ${period} floor ${floor.id} meter`);
    }
  }
});

 test('Vite entry loads local dataset and application modules without external APIs', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const entry = await readFile(resolve(root, 'src', 'main.js'), 'utf8');
  assert.match(html, /src="\/data\/datasets\.js"/);
  assert.match(html, /src="\/src\/main\.js"/);
  assert.match(entry, /\.\/app\.js/);
  assert.match(entry, /\.\/components\/network\.js/);
  assert.match(entry, /\.\/styles\/styles\.css/);
});
