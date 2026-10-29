# Hourly water and sensor data — schema 2

All readings are synthetic educational data. Geometry, tenant use, temperature, pressure and energy are not actual Kremmergården measurements.

## Editable sources

| File in `data/` | Contents / units |
| --- | --- |
| `building.json` | Floors, tenant IDs, areas, types and symbolic geometry |
| `retrofit_consumption_profiles.json` | Category demand, normalized hourly weights, opening hours, weekday factors and hot-water fractions |
| `data_manifest.json` | Schema version, file names, time and units |
| `module_cold_water_2026.csv` | `timestamp_utc`, then one column for each of the 35 modules; litres used during each hour |
| `module_hot_water_2026.csv` | Same module columns and timestamps; hot-water litres during each hour |
| `common_water_2026.csv` | Separate cold/hot common-area litres for each floor, plus `main_leak_L` |
| `leak_events.json` | Leak and sensor-offset event descriptions |
| `sensors.json` | Registry of 69 instrument channels, scopes, kinds, networks and units |
| `sensor_readings_2026.csv` | `timestamp_utc` plus one column per sensor channel; 8,760 rows |

The old mixed `monitoring_2026.json` / `.csv` files are superseded and removed. Cold and hot are separate files so **each numeric module column still represents one module**, rather than mixing meters and tenant data in the same table.

The initial migration preserves each original hourly module/common total to the centilitre: hot is the rounded category fraction and cold is the remainder. All baseline floor and building totals are preserved, including the original leak events.

## Time and balance

Exactly 8,760 consecutive hour-start timestamps run from `2026-01-01T00:00:00.000Z` to `2026-12-31T23:00:00.000Z`. The UI treats UTC fields as a nominal building clock, without daylight-saving changes. L/hour in module files means **volume used within that hourly interval**. Average flow is that volume divided by 60, in L/min.

```
unit total = unit cold + unit hot
floor total = tenant totals on floor + floor common cold + floor common hot
OUTLET = sum of floor totals
MAIN = OUTLET + main leakage
S1 = MAIN / 60           (L/min)
S2 = OUTLET / 60 - documented sensor offset
```

The inlet cold pump pressurizes all incoming mains water, including water subsequently heated. Floor cold sensors measure cold end use; floor hot sensors measure hot end use. Thus inlet flow differs from the cold end-use riser. Sewage is assumed to receive 100% of legitimate tenant/common demand, excluding mains leakage.

Flow channels: L/min. Energy channels: kWh used during one hourly period (`kWh/hour` in the registry describes the interval, not a cumulative register). Pump channels: average kW; numerically equal to the one-hour kWh interval. Temperatures: °C. Pressure: bar. The rainwater channel is intentionally blank/null, meaning unavailable; it is not a zero-flow measurement. Both flow and thermal/electrical quantities are explicitly simulated.

## Editing and rebuilding

Edit water CSVs in a text editor or spreadsheet without changing headers, timestamp order or units. Then run `npm run data:build`. This validates every water row, regenerates the complete sensor CSV and registry from the shared water data, and rebuilds `public/data/datasets.js` for the browser. Refresh the app after rebuilding. The sensor CSV is a **derived output**; edit sensor formulas in `src/data-model.js` rather than editing values that the next build would overwrite. Building/profile CSVs are convenience exports of their JSON sources.

`npm run data:generate` intentionally regenerates water data from building/profile assumptions with fixed seed 20260101 and then rebuilds sensors and the browser bundle. The seeded generator retains weekday/weekend, seasonal and correlated hourly variations. Use this command after changing baseline geometry or baseline profiles. Both commands use Node built-ins only.

`src/engine.js` derives a transient integer-centilitre meter table for chart aggregation. It is an internal runtime view, not another stored baseline dataset. Consumers should use `engine.waterSplit(hour, selection)` for cold/hot, `engine.sensorValue(id, hour)` for instruments, and the existing metrics/series API for aggregates.

## Retrofit editor and local scenarios

Development → **Open building editor** opens the fitted section diagram. Click a whole module rectangle to open the compact 4 × 3 type menu. Vacant unit remains in the data model but is omitted from this editor menu. Choose a type to immediately replace its color/type label in the editor. The right panel groups tenant type, active area, occupants, opening/closing schedule, daily occupancy duration and hot-water share in six cards.

Changes remain draft until **Apply scenario**. Apply clones the active configuration and water table, replaces changed module columns, regenerates all dependent sensors, then updates the entire app. The active scenario is saved in IndexedDB; no source file is overwritten. Reload restores it. **Restore supplied baseline** in the editor returns the whole application to the embedded 2026 configuration/data. **Save draft** stores unapplied edits locally, including imported loads and virtual sensors, without changing monitoring. Reopening the editor restores a saved draft. Close or Escape discards edits made since the last save. Apply and Restore baseline clear the saved draft.

The editor right pane is organized into header actions, annual water gauges, equipment menus and module settings. **Add sensor** currently supports a virtual module flow meter; thermometer, energy meter and pressure meter are marked Not available. **Add systems** lists pump, heater and tank as Not available extension points. The existing flow meter reads the selected module’s cold + hot hourly demand and does not add water consumption.

Area is active tenant area. A floor's budget is gross area minus fixed common area (20%). Areas may total less than the budget; the remainder is unallocated tenant area with no additional demand. Increasing an area requires reducing another module on that floor within the same draft. Apply rejects over-allocation, invalid hours and invalid occupancy values. The diagram stays symbolic; rectangle dimensions are not architectural area measurements.

Calculated demand is:

```
daily L = area × category L/m²/day × weekday factor × inherited daily variation
          × occupants / max(1, round(area/20))
          × occupancy hours / category opening duration
```

The inherited seasonal/day variation is inferred from the active module's previous daily demand relative to its old category expectation and bounded 0.5–1.5. This is an educational scenario method, not a calibrated prediction. Zero occupants or zero occupancy hours yields zero calculated consumption. Changing a category updates typical opening hours, occupancy duration and hot-water fraction. Opening-hour weights are time-mapped from the chosen category, normalized, and distribute 98% within the selected schedule and 2% background outside it (24-hour opening uses 100% within). The hot/cold split is rounded to centilitres while preserving each total. Occupants and occupancy time are simple scenario multipliers and should be calibrated by students.

**Add sensor** places one virtual total-flow sensor on the selected module. Its `V-F-<module>` tag distinguishes it from supplied sensor assumptions. The reading observes the module’s existing cold + hot hourly volume divided by 60 (L/min); adding it does not create extra demand or a new CSV channel. Applied annotations are stored in `building.scenarioSensors` and appear in the main diagram with independent gauge balloons. The Add sensor menu switches to **Remove flow meter** when the selected module already has one, so it can be removed there.

## Import a module load

In the selected module's control panel, download its template or import a CSV with exactly:

```
timestamp_utc,cold_L,hot_L
2026-01-01T00:00:00.000Z,12,3
... all 8,760 consecutive hours ...
```

Every value must be finite, non-negative and present. Timestamps must match the full 2026 hourly sequence. Import replaces that module's cold/hot profile when Apply is clicked, and all aggregate/sensor values then follow it. An imported load overrides area/occupancy calculation; **Use profile instead** re-enables calculation. It never replaces unrelated tenant columns or baseline files.

## Extension boundaries

- `src/components/retrofit-editor.js`: diagram selection, type drawer and form; no chart changes belong here.
- `src/scenarios.js`: pure scenario calculation, validation and CSV import; returns a new building/data record.
- `src/data-model.js`: shared CSV format, water aggregation, sensor registry and derived sensor formulas, used by Node and browser.
- `src/diagram-readings.js`: present stored channels in independent instrument balloons.
- `src/components/building-interactions.js`: main diagram module/floor selection and sensor hit targets.
- Student pump control, efficiency, extreme conditions, rainwater and heat recovery retain their isolated extension panels.

Pump electricity uses 30 m head (cold inlet) and 12 m head (hot pump), with load-dependent electrical efficiency around 65%. Useful heating energy is `hot litres × 4.186 × (60 − cold °C) / 3600`. Cold temperature varies seasonally around 10°C; mixed sewage is cooled by 6°C. Pressure is the equivalent rise from the assumed pump head. These are reproducible assumptions, not operational or engineering design advice. Historical leak investigations refine hourly stored S1/S2 into synthetic minute samples; explicit training cases do not alter the hourly dataset.

See [Sensor naming and sewage tank assumptions](SENSOR-NAMING.md) for the S-type-position convention, instrument gauges and tank balance.
