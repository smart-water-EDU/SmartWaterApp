# Smart Drops educational model

This is a synthetic teaching model, not actual Kremmergården instrumentation or architectural information. The full current data structure, editor calculations, units and extension boundaries are documented in [DATA-SCHEMA.md](DATA-SCHEMA.md).

## Building and baseline demand

Seven floors total 16,000 m²: U1 2,350; L1 and L2 2,800 each; L3–L6 2,012.5 each. Each floor reserves 20% as common/technical area. The remaining 12,800 m² is initially distributed among 35 tenant modules. The embedded SVG is a user-edited symbolic network; its geometry is used for hit targets. It is not an architectural plan.

Initial tenant categories and areas are in `data/building.json`. Category profiles are in `data/retrofit_consumption_profiles.json`. Their illustrative specific consumption is in L/m²/operating day: office 2.2; retail 0.6; restaurant 8; café 6; supermarket 2.2; fitness 4.5; clinic 3.5; public services 2; vacant 0.1; common areas 0.4. Added scenario categories include parking, storage, educational and training, each clearly labeled as an editable assumption.

Baseline hourly volume is area × category consumption × weekday factor × normalized hourly weight × seasonal multiplier × correlated variation. Each 24-hour profile sums to 1. Off-hours retain background demand. The seasonal multiplier is `1 + 0.075*cos(2π*(monthIndex-6)/12)`. A shared 0.94–1.06 variation correlates channels within an hour, with individual 0.90–1.10 variation. Fixed Mulberry32 seed: 20260101. Volumes are rounded to centilitres before splitting into cold/hot CSV columns and aggregating. Peak demand is a category-factor estimate from the maximum hourly flow, not a plumbing design calculation.

## Current data architecture

Two wide CSVs store hourly cold/hot module loads. Common areas and leakage have a separate CSV. An hourly sensor CSV and JSON registry contain flow, energy, pressure, temperature and pump channels. Water source columns determine every aggregate and sensor, with documented sensor offsets kept separate from physical leakage. `npm run data:build` validates water files, derives sensors and rebuilds the offline browser bundle. `npm run data:generate` intentionally regenerates the seeded baseline.

The functional retrofit editor clones the active configuration and data, applies validated module edits/imports, then recomputes all dependent channels. Apply activates and saves the scenario locally; the baseline remains restorable. See DATA-SCHEMA.md for occupancy assumptions, floor-area budgets and import format.

## Leak investigation

| Event | Nominal 2026 time | Physical leak | Recorded loss |
| --- | --- | --- | --- |
| E01 | 12 Feb 01:00–10:00 | 0.7 L/min | 0.378 m³ |
| E02 | 17 Jun 09:00–18:00 | 9 L/min | 4.860 m³ |
| E03 | 8 Sep 12:00–16:00 | None; S2 offset 2.4 L/min | 0 m³ |
| E04 | 4 Nov 02:00–08:00 | 4 L/min | 1.440 m³ |

Historical S1/S2 channels are refined into deterministic minute samples with shared sinusoidal flow variation and limited downstream noise. These examples explain alarms; minute samples do not replace hourly metered volumes. Basic leakage is `S1 − S2`; with a legitimate measured branch, residual is `S1 − S2 − B1`. Negative residuals are reported as reverse imbalances, never converted into positive leaks. Threshold alarms alone cannot distinguish leakage from a bad sensor. No valve/equipment operation is implemented.

## Instruments and charts

Whole module rectangles select tenant data in the counters/charts. Floor labels select tenant plus common-area demand. Independent instrument balloons show stored sensor channels without changing KPI selection. Hover/focus previews, click/tap pins, and Escape/outside click/hiding a pipe layer dismisses a balloon. Current mode shows hourly flow/volume; accumulated mode sums the selected 1–168-hour interval.

The cold inlet pump pressurizes all mains flow, including water later heated. It uses an assumed 30 m head; the hot pump uses 12 m. Electrical efficiency varies with flow around 65%, so energy is not simply a fixed multiple of flow. Stored hourly energy agrees with this shared model. Useful heating energy is hot-water litres × 4.186 × temperature rise / 3600. Temperature and pressure assumptions are documented in DATA-SCHEMA.md. Rainwater readings remain unavailable until a rainwater model is connected.

Monitoring's stacked consumption/energy charts use a shared 24-hour history and 24-hour forecast. Forecasts use only preceding readings with matching weekday/hour (up to 28 days), with same-hour and last-reading fallbacks. They do not use future baseline readings. Maintenance's accumulated energy projection covers six months before/after the clock and applies illustrative efficiency degradation of four percentage points per six months. These are educational projections, not maintenance predictions.

## Student development

Keep calculations in separate modules and use the documented scenario/data APIs. The student extension panels for smart pump control, energy efficiency, extreme conditions, heat recovery and rainwater retain isolated code markers. Build additional systems there without altering unrelated selection controls or the immutable baseline. The facade photo is user-provided, credited to bypatrioten.com; retain source and reuse permissions with redistributed materials.
