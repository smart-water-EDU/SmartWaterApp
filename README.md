# Smart Water App

Smart Water App is a local-first Vite and Node.js project for exploring building-scale water monitoring and management. It preserves the Smart Drops interface, interactive building network, student guides, editable assumptions, CSV exports, and simulated 2026 dataset. Building geometry, readings, sensors and pump estimates are educational assumptions, not measured Kremmergården data.

## Run it in VS Code

You need Node.js 22.12 or newer and Git. Install Node.js from [nodejs.org](https://nodejs.org/) and Git from [git-scm.com](https://git-scm.com/downloads). Node.js includes npm.

1. Clone `https://github.com/smart-water-EDU/SmartWaterApp.git` in VS Code with **Git: Clone**, or run:

   ```sh
   git clone https://github.com/smart-water-EDU/SmartWaterApp.git
   cd SmartWaterApp
   ```

2. Open the `SmartWaterApp` folder in VS Code.
3. Choose **Terminal → New Terminal** and run:

   ```sh
   npm install
   npm run dev
   ```

Vite opens the app at `http://127.0.0.1:5173/`. Keep the terminal open while developing. Save code changes to see them refresh in the browser. Stop the server with **Ctrl+C**.

The first `npm install` downloads Vite and its small development dependency set. After that, the app's own data and assets are local; the application does not call an external API or require an account. No installer or executable is needed. This project uses the browser for the interface and Node.js/Vite for the development server and build.

## Useful commands

```sh
npm run dev       # Start the local Vite development server
npm test          # Check the default model and baseline data
npm run build     # Create a production site in dist/
npm run preview   # Preview the production build locally
npm run data:build    # Validate hot/cold CSVs, regenerate sensors and browser bundle
npm run data:generate # Regenerate the seeded 2026 baseline, then rebuild exports
npm run data:weather  # Regenerate the separate seeded rainwater weather CSV
```

`npm run build` can also be used by a static host such as Cloudflare Pages with `dist` as the output directory. The build does not edit the JSON or CSV baseline files. `npm run data:generate` intentionally regenerates the default data and should be used only when you are changing the educational building or demand assumptions.

## Project map

```text
index.html                     Vite HTML entry and embedded interactive SVG
src/main.js                    Loads styles and app modules in dependency order
src/app.js                     Tabs, clock, panels, controls and local settings
src/engine.js                  Water totals, chart series and module metrics
src/sensors.js                 Sensor readings and leak-balance logic
src/diagram-readings.js        Balloons for stored hourly instrument channels
src/data-model.js              Shared water schema, CSV validation and sensor formulas
src/pump-model.js              Flow-based energy and efficiency estimates
src/scenarios.js               Immutable retrofit scenario calculations and load imports
src/components/retrofit-editor.js Layered building editor, type drawer and module panel
src/components/                Charts and interactive building-network controls
src/platform/browser-bridge.js Local storage and browser fullscreen interface
src/styles/                    Shared components and SVG styling
src/styles/control-room.css    Active dashboard theme and responsive layouts
public/assets/                 Building photograph, logo and diagram artwork
public/data/datasets.js         Generated local data bundle used by the interface
data/*.json                    Building, profiles, sensor registry and data manifest
data/*.csv                     Cold/hot module loads, common loads and hourly sensors
public/docs/                    Student-guide downloads
docs/                           Model notes and editable guide source
tools/                          Deterministic dataset builders
tests/                          Node built-in model and dataset checks
```

## Data and development notes

The baseline contains 8,760 hourly periods for 2026. Each module has one column in `data/module_cold_water_2026.csv` and one in `data/module_hot_water_2026.csv`, both in litres per hourly period. `data/common_water_2026.csv` contains floor common loads and main leakage. `data/sensor_readings_2026.csv` stores 69 hourly flow, energy, temperature, pressure and pump channels; `data/sensors.json` defines their units. The reserved rainwater channel is blank until modeled. Main, floor and module totals reconcile from these shared hot/cold columns.

Run `npm run data:build` after editing water CSVs; it validates water data and regenerates derived sensor readings and the local browser bundle. Development start and production build also run this step automatically. `npm run data:generate` intentionally regenerates the seeded baseline water files.

In **Development → Open building editor**, click a module rectangle to choose a tenant type. Edit area, occupants, schedule, occupancy duration or hot-water share in the right panel, or import a full 2026 module CSV with `timestamp_utc,cold_L,hot_L`. Download the module template directly in the editor. **Apply scenario** updates all tabs and instruments and persists the active configuration/data in IndexedDB. **Save draft** keeps unapplied edits on this device, while **Close** leaves the active app unchanged. The editor header compares full-year water consumption for the current model and the draft. Reopen the editor and use **Restore supplied baseline** to reset the whole building and dataset. Source baseline files are never changed by the editor. Floor-area budgets are validated before applying.

See [Data schema and editor model](docs/DATA-SCHEMA.md) for columns, units, import validation, calculation assumptions and student extension boundaries.

Use small modules when extending the project: add calculations under `src/`, connect them through a narrow UI boundary, and add focused checks under `tests/`. Keep scenario data separate from the baseline. See `docs/MODEL.md` for units, assumptions, balance rules and suggested extension points.

## Student guide

The app includes a step-by-step guide in **Notes for students** and a downloadable PDF. It covers cloning this repository, installing dependencies once, running `npm run dev`, making a small edit, and checking changes safely in Git.

See [Sensor naming and sewage tank assumptions](docs/SENSOR-NAMING.md) for the S-type-position convention, instrument gauges and tank balance.

## Visual heat recovery

Open **Development → Additional Systems → Sewage Heat Recovery**, or click the exchanger on the sewage layer. Choose an exchanger type and heat uses, arrange connected consumer nodes, allocate exactly 100% of recovered heat and save the design locally. Equal-size gauges show selected-hour heater power and sewage temperature, plus year-to-date heater electrical energy and recovered thermal heat. Recovery uses a physically capped 40% teaching target and 98% electric-heater efficiency. Three editable equipment presets and seven generated transparent PNGs are included. See [Heat recovery designer](docs/HEAT-RECOVERY-DESIGNER.md) for the workflow, preview assumptions and student extension boundaries.

## Rainwater collection and reuse

Open **Development → Additional Systems → Rainwater Collector**. Configure roofs, storage and collection assumptions, select rainwater consumers and inspect their connections and annual supply. Import a complete hourly 2026 weather CSV from the weather frame header, or optionally retrieve historical reanalysis through Open-Meteo. Completed-year API data are clearly labeled when replayed on 2026. Designs and imported weather save locally, independently of the potable-water baseline. Four generated consumer PNGs are included. See [Rainwater designer](docs/RAINWATER-DESIGNER.md) for the storage balance, CSV format, assumptions and student extension files.

The two student guides in `docs/` are the editable Word sources, with matching PDFs. **Notes for students** opens their updated text and offers each PDF from the pop-up header. Published copies in `public/docs/` are included in the Vite build. Guide 01 covers setup, Git and IDE/AI workflows; Guide 02 starts with sewage heat recovery and rainwater before the remaining student extensions.
