# Educational model and extension notes

## Geometry and tenants

The seven floors total 16,000 m²: U1 2,350; L1 and L2 2,800 each; L3–L6 2,012.5 each. Each floor reserves exactly 20% as common area. Remaining area is distributed equally among that floor's modules (6, 8, 5, 4, 4, 4, 4). Fractional unit areas are retained internally and rounded only for display. SVG coordinates, technical room, supply riser, valves and sensors are symbolic. Floor colors are consistent across the diagram and comparisons.

Tenant categories follow the assignment assumptions. U1 includes retail, supermarket, fitness and services; L1 retail, café and restaurants; L2 retail and commercial/public services; upper floors offices, clinic and public services. These are assumed assignments, not a directory of actual tenants. The SVG is a symbolic section with a flat top; floor and unit widths scale linearly to the modeled gross floor area, all from a shared left edge.

## Consumption assumptions

The specific consumptions in `retrofit_consumption_profiles.json` use **L/m²/operating day**: office 2.2; retail 0.6; restaurant 8.0; café 6.0; supermarket 2.2; fitness 4.5; clinic 3.5; public services 2.0; vacant 0.1; common areas 0.4. These are illustrative educational inputs, not verified Norwegian benchmarks.

For each demand channel and hour:

```text
L/hour = area × specific consumption × weekday adjustment
         × normalized hourly weight × seasonal multiplier
         × shared hourly variation × individual channel variation
```

Weekday adjustment arrays run Monday–Sunday. A factor below 1 represents reduced closed-day cleaning, standby or limited operation. Off-hours have a raw profile weight of 0.025 relative to typical opening-hour weights; all 24 weights are then normalized to sum to 1. This is intentional background consumption, not extra volume added after normalization. Typical opening hours do not imply a hard zero outside them. Vacant units have low, uniform standby use.

Restaurant/café profiles peak around meals, fitness around morning/evening, and offices/retail near midday. The seasonal multiplier is `1 + 0.075*cos(2π*(monthIndex-6)/12)`. A shared 0.94–1.06 variation correlates channels each hour, with individual 0.90–1.10 variation. The fixed Mulberry32 seed is 20260101. Volumes are rounded once to integer centilitres before meter aggregation.

Daily module demand in the UI is the full selected day's synthetic demand, not merely area × coefficient. Estimated peak flow is that day's maximum hourly mean flow multiplied by the category peak factor. It is an illustrative short-duration estimate, not a plumbing capacity or regulatory sizing calculation.

## Dataset format and time

`monitoring_2026.json` contains metadata, column descriptors, four event descriptors and 8,760 row arrays. Each row is one hourly **volume**, in integer centilitres. The first 35 columns are tenants, the next seven common-area channels. Remaining columns are LEAK, MAIN, OUTLET and seven explicit floor meters M-U1…M-L6. Always locate columns by their IDs instead of hardcoding indices in extensions.

```text
floor meter = sum of tenant channels on the floor + floor common-area channel
OUTLET = sum of all floor meters
MAIN = OUTLET + LEAK
1 L = 100 cL
1 m³ = 100,000 cL
hourly average L/min = hourly cL / 6,000
```

No separate random meter values are generated. Every displayed distribution and timeline is calculated from the same demand channels. Meter columns have no `floor` property, preventing double counting when aggregating floors. The engine reads a static browser data bundle generated from the adjacent JSON files. Settings and proposal drafts are saved by the browser bridge to local browser storage.

The model uses a fixed **nominal building clock**. ISO UTC fields encode these fixed labels and are displayed with UTC getters; they do not claim timezone-aware civil timestamps in Ålesund. This deliberately omits daylight-saving changes and yields 365 × 24 periods. It is explained beside the clock and in settings. A timezone-aware model is a future modeling choice.

KPI today/month/year totals include the complete selected hourly period. Current flow is an hourly average, not an instantaneous observation. Timeline bars show entire selected periods, including subsequent hours within a day. Yearly view has a single 2026 bar because no other years exist.

## Leaks and sensors

The historical main segment has S1 upstream and S2 downstream. No withdrawals or storage changes occur between them. The main-pipe event loss is upstream of all floor meters. Events are half-open intervals `[start, end)`:

| Event | Nominal date/time | Physical leak | Recorded loss |
|---|---|---:|---:|
| E01 | 12 Feb 01:00–10:00 | 0.7 L/min | 0.378 m³ |
| E02 | 17 Jun 09:00–18:00 | 9 L/min | 4.860 m³ |
| E03 | 8 Sep 12:00–16:00 | 0; S2 offset 2.4 L/min | 0 m³ |
| E04 | 4 Nov 02:00–08:00 | 4 L/min | 1.440 m³ |

Selected historical sensor flow is derived from the same MAIN/OUTLET row, then refined into 60 deterministic minute samples with shared sinusoidal demand variation and up to ±0.06 L/min downstream measurement noise. Noise amplitude is limited at low demand to preserve positive readings. The sensor offset does not alter meter totals. Minute samples are explanatory synthetic observations; they are not additional recorded meter data and are not integrated to replace the baseline.

`flowBalance(S1, S2, B1, threshold)` computes:

```text
raw difference = S1 - S2
unexplained residual = S1 - S2 - legitimate withdrawal B1
estimated leakage = max(0, residual)
alarm = residual > threshold
reverse imbalance = residual < -threshold
L/hour = estimated L/min × 60
m³/day = estimated L/min × 1,440 / 1,000
```

For 9 L/min: **540 L/hour, 12.96 m³/day if sustained**. These are extrapolations, not the finite event's accumulated loss. A sensor anomaly can produce a positive residual without physical leakage; investigate the assumptions and sensor quality. The alarm is an explanation aid, not an automatic leak diagnosis.

Training cases are explicitly separate from historical mode. Their leaks/offsets operate at minutes 20–45; the branch case includes a known 3 L/min withdrawal throughout. Branch/offset training cases use at least 5 L/min legitimate through-flow to keep all samples physical. These cases do not change baseline records. Floor and riser selections use virtual S1/S2 boundary sensors, explained in the UI; historical leaks exist only on the main segment. Valve symbols have no operational controls.

## Local storage and security

Main/preload use context isolation, sandboxing and no renderer Node integration. A strict CSP forbids remote connections and the main session additionally blocks HTTP, HTTPS and WebSocket requests. Popups and navigation are blocked. The preload exposes only three fixed data filenames, loading settings and saving size-limited JSON settings. There is no arbitrary filesystem API in the renderer.

User interface state, simulation clock, network layer selection, meter display window, threshold and saved proposals live in `app.getPath('userData')/water-manager-settings.json`. Writes are serialized using a temporary file and rename. Invalid settings fall back to defaults. The interface persists changes after a short debounce.

## Section network layers and demand meters

The section supports an overlay of one or more schematic pipe networks: cold supply (blue), hot supply (orange), and sewage return (muted purple). At least one pipe layer remains visible. A simplified heater connects to the hot-supply riser; sewage branches drain to the lower service outlet. Routes, valves, equipment, sensors and arrows are illustrative, not surveyed plans.

The circle by each module ID is that unit's virtual demand meter; every floor has its own floor-total meter. Values come from tenant and common-area baseline demand channels, not independent instrumentation. In **Current** mode, displayed L/h is the average hourly demand for the selected clock hour. In **Accumulated** mode, values show litres across the inclusive selected-hour window of 1–168 periods. The floor meter includes that floor's common area. Neither floor nor tenant meters include main-pipe leakage. Existing S1/S2 main-network sensors and their readings remain the separate leak-investigation model. The baseline contains no hot-water or sewage-flow series; toggling those pipes changes the drawn network layer without changing the demand meter readings.

The property selector currently contains Kremmergården only. Adding a property requires an additional building configuration and corresponding monitoring series; the current selector is a ready entry point rather than a building-model importer.

## Pump monitoring and projections

Management shows a 24-hour historical water-flow window and the following 24-hour forecast. The future bins are averages of preceding simulated meter readings with a matching hour and weekday (up to the prior 28 days); if there is no weekday match, the model falls back to the same hour over the preceding 14 days, then the last available reading. It does not read future baseline rows. The stacked pump graphs use shared hourly x positions and can show either raw hourly values or a cumulative sum across the displayed 48-hour window. Pump energy is estimated per hourly interval from main-meter flow and a fixed 30 m head using hydraulic power, water density 1,000 kg/m³ and gravity 9.81 m/s². Electrical efficiency varies gently with operating flow: `eta_e(flow) = 0.65 × (0.94 + 0.06 × min(1, eta_opt(flow) / 80%))`, anchored at 65% near the modeled best-efficiency point. This small part-load adjustment keeps energy from being a fixed scalar multiple of flow. These are simplified estimates, not equipment measurements.

The pump curve uses a 3.5 m³/h best-efficiency flow, 80% peak efficiency and a symbolic parabolic shape. Its operating point comes from the selected simulated sensor reading (S1, S2 or B1) at the selected clock minute, converted from L/min to m³/h. Selecting “All sensors” hides the operating-point markers because there is no single sensor flow to plot. Current condition is assumed to be 95% of the ideal curve; 6-, 12- and 18-month projections subtract four percentage points linearly per six months. This is a teaching example only, not a maintenance prediction. The separate `src/pump-model.js` module holds these assumptions and pure calculation functions; the water baseline remains unchanged.

## Student development path

1. Change building geometry, tenant assignments or existing assumptions in their JSON files. Intentionally regenerate a new baseline and run both test commands.
2. Extend the separate proposal schema if needed. Keep source baseline channels immutable. Do not multiply existing generated hourly volumes by a new category coefficient; resolve the proposed profile, area, schedule and adjustments to generate a separate scenario series.
3. Implement `calculateRetrofitImpact()` as a pure calculation returning a new series, floor/building totals and comparison metadata. Define how occupancy/customers interact with area-based consumption to avoid double counting. Define overnight opening hours and peak-capacity assumptions.
4. Connect the proposal workspace to scenario results while retaining independent baseline charts.
5. Implement rainwater catchment, filtration, storage mass balance and non-potable demand allocation through the reserved extension objects. None is calculated in Phase 1.

The bundled facade photo is user-provided; keep its source and reuse rights with the course materials when redistributing the project.
