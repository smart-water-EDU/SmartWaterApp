# Rainwater collector designer

Open **Development → Additional Systems → Rainwater Collector**. This fixed-size window has four columns: a full-height roof-collector frame on the left, narrower stacked consumer cards in the middle, an aligned consumption-pattern column, and weather/history charts on the right. Roof and weather titles sit above their frames. A 150px connection corridor separates roofs and consumers on desktop (the cards moved 50px left); it reduces on narrow screens. The weather column uses 60% of its preceding width; consumer cards use approximately 50% on desktop. CSV and API import controls are in the weather frame header. Connections automatically link selected roofs and consumers. On phones, roofs and weather sit above the aligned consumer and consumption-graph rows. The window has no draggable canvas or scrolling.

## Workflow

1. Enable one or both roof collectors. Edit surface area in m² and runoff coefficient in %. Initial areas come from the symbolic upper floor footprint and the remaining lower roof footprint: 2,012.5 + 787.5 = 2,800 m². These are educational assumptions, not verified roof measurements.
2. Set collection efficiency, pump capacity in L/min, and storage capacity in m³ (in the header).
3. Choose irrigation, flush tanks, cooling and/or parking washing. Connections appear automatically. Each selected purpose has an editable nominal daily demand in L/day; monthly, weekday and normalized hourly factors come from `data/rainwater_presets.json`.
4. The header shows tank capacity, annual precipitation, maximum hourly precipitation, annual rainwater supplied and the proportion of consumer demand met by rainwater. The roof panel shows potential collected water; the weather panel shows overflow and annual mean temperature. The selected-hour temperature and precipitation initially follow the main simulation clock. Click the daily graph to inspect another hour. The former date/time input has been removed. The daily plot combines a temperature curve (°C) and precipitation bars (mm/h); the monthly precipitation chart shows the full 2026 educational history. Click a month to inspect its first day. These inspection controls do not change the main clock or saved water balance. Monthly bar tooltips include precipitation and mean temperature.
5. Save design stores the configuration locally. Reopen to edit it. Close or Escape discards unsaved changes. Clear disconnects all roofs/consumers while retaining numerical settings and weather; saving requires a roof and a consumer with positive area/demand.

## Weather file

`data/rainwater_weather_2026.csv` contains 8,760 consecutive hourly rows on the application's 2026 teaching clock. The values are **2025 historical ECMWF IFS reanalysis for a grid cell near Ålesund IV / Nørve (SN60945), replayed by month, day and hour on 2026**. They are location-specific modeled estimates, not measurements from the station or Kremmergården, and not actual 2026 weather. Station coordinates, returned grid-cell coordinates, source URL, license and retrieval date are in `data/rainwater_weather_source.json`. Temperature is displayed as context; this version does not simulate freezing, snow accumulation or temperature-driven cooling demand.

```csv
timestamp_utc,precipitation_mm,temperature_c
2026-01-01T00:00:00.000Z,0,-2.3
```

Precipitation is the depth falling during the hour, not a flow rate. Imports must cover every 2026 hour in UTC, in order, without missing or duplicate readings. Rain must be non-negative; temperature must be between −60 and 70 °C. Import CSV in the weather frame header replaces the active weather; Reset restores the supplied Ålesund replay. The CSV download button has been removed. The supplied source CSV remains an editable template. Imported weather is stored with the local design and does not overwrite source files. To refresh the supplied 2025 history from Open-Meteo, run `npm run data:weather` with internet access, then refresh or rebuild. The app itself does not need internet to use the bundled history.

## Hourly water balance

The tank begins empty. Each hour:

```
effective area m² = sum(enabled roof area × runoff coefficient) × collection efficiency
collected m³ = precipitation mm × effective area m² / 1000
overflow m³ = max(0, previous storage + collected − tank capacity)
available storage m³ = min(tank capacity, previous storage + collected)
consumer demand m³ = nominal L/day / 1000 × hour weight × weekday factor × month factor
supplied m³ = min(available storage, total consumer demand, pump L/min × 60 / 1000)
end storage = available storage − supplied
mains backup = consumer demand − supplied
```

Consumer allocation is proportional to simultaneous demand. Incoming rainfall and overflow are processed before withdrawal, a deliberate hourly approximation. Every hour and the annual totals conserve water, including storage changes, overflow and mains backup. Nominal demand describes an active day before schedule/season adjustments. Profile weights sum to 1.0; irrigation and cooling can be inactive in winter.

This is a separate design preview. Saving does not change the potable-water baseline, tank sensor readings, pump energy charts or reserved rainwater sensor channel. Linking the design to monitoring, modeling treatment and water quality, snow/frost, irrigation climate response, control strategies and lifecycle cost are student extension points.

## Source and storage boundaries

- `src/rainwater-model.js`: CSV validation, pure hourly simulation and design validation.
- `src/rainwater-storage.js`: localStorage key `smart-drops-rainwater-design-v1`.
- `src/components/rainwater-designer.js`: fixed collector/consumer view, connections, imports and controls.
- `src/styles/rainwater-designer.css`: scoped layouts.
- `data/rainwater_presets.json`: editable demand schedules, capacity and collection assumptions.
- `tools/fetch-alesund-weather.mjs`: validates and refreshes the bundled Ålesund replay.
- `src/weather-locations.js`: named Nørve and Vigra reference stations and coordinates.
- `tests/rainwater.test.js`: weather validation, schedules, storage balances, input effects and persistence.
- `src/app.js`: integration with Additional Systems settings.

The validated design is also copied into the app's Additional Systems settings. Storage belongs to the browser profile and origin; no network service or account is needed. Save reports storage failures. The source contains `STUDENT EXTENSION: RAINWATER` markers for targeted changes without disturbing other systems.

## Icons

Four transparent PNG consumer thumbnails in `public/assets/rainwater/` were generated with OpenAI built-in image generation: irrigation, toilet flushing, cooling and parking washing. They share blue/turquoise tones and restrained orange details. `generation-prompts.json` records their exact prompts. These are symbolic illustrations.

## Optional online weather import

**Ålesund API** opens a compact dialog with two fixed reference locations: Ålesund IV / Nørve (SN60945, 62.4703° N, 6.2108° E) near the city, and Ålesund Airport / Vigra (SN60990, 62.5617° N, 6.1150° E). Nørve is the default. The coordinates come from published Norwegian station listings. The API uses the nearest model grid cell to the selected station coordinates; its returned cell center is recorded separately. These are **model outputs, not station observations**. Internet is used only when a button in this dialog is pressed; the normal app remains local.

**Check live now** requests [Open-Meteo current conditions](https://open-meteo.com/en/docs) for the selected location. It shows model temperature and precipitation in the preceding **15 minutes**, with a UTC timestamp. The live check is informational and never changes the historical 2026 replay or rainwater balance. **Import historical year** requests complete hourly temperature and precipitation from the [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), using ECMWF IFS reanalysis and the same location. Open-Meteo / ECMWF data are attributed under CC BY 4.0; the [provider terms](https://open-meteo.com/en/terms) describe educational/non-commercial API use.

The application requires 8,760 hours for its 2026 model. A completed earlier source year is replayed by month/day/hour on 2026 and clearly labeled, for example **Ålesund IV / Nørve · 2025 → 2026 replay**. Leap day is omitted. Source year, station reference, actual grid cell, request URL and import time are preserved with the design. The complete returned year is validated for chronology, units, grid location and missing readings before replacing active weather. Failure or cancellation leaves the existing data in place. Imported rows save with the local design for offline reuse.

API precipitation includes the water equivalent of rain and snow. This simplified storage model processes that input immediately; snow storage and melt remain extensions.

- `src/weather-api.js`: live and historical URLs, provider validation and replay normalization.
- `src/components/weather-api-dialog.js`: fixed Ålesund location selector, live check and historical import.
- `tests/weather-api.test.js`: station coordinates, live values, replay, leap year, missing data and error checks.

## Consumer demand and supplied-rainwater curves

A borderless plot column sits between the narrower consumer cards and weather panel. Its four rows align with the four consumers. Desktop cards are approximately half their preceding width and the weather column is 60% of its preceding width; narrow windows use a compact rearrangement. The collector frame remains bordered.

Each selected consumer plots hourly demand and actual rainwater allocation from the same annual tank simulation, in L/h, over three days before and three days after the main simulation hour. Supply cannot exceed demand. Solid curves represent the earlier simulation period and dashed curves the proposed future period; projections replay the active weather and demand assumptions, not a live weather forecast. The main simulation clock anchors this window; inspecting weather bars does not move it.

Hover a curve or focus a graph and use Left/Right (Home/End for the window limits) to inspect its timestamp, demand and rainwater supply. Dates outside the 2026 dataset remain blank; disconnected consumers show a prompt instead of invented readings. Model edits, imported weather and local design restoration update these same curves. New extension files are src/components/rainwater-consumption-charts.js and src/styles/rainwater-consumption-charts.css; tests/rainwater-consumption.test.js checks hourly reconciliation and boundary behavior.
