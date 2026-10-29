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
npm run data:build    # Rebuild CSV exports and the browser data bundle from JSON
npm run data:generate # Regenerate the seeded 2026 baseline, then rebuild exports
```

`npm run build` can also be used by a static host such as Cloudflare Pages with `dist` as the output directory. The build does not edit the JSON or CSV baseline files. `npm run data:generate` intentionally regenerates the default data and should be used only when you are changing the educational building or demand assumptions.

## Project map

```text
index.html                     Vite HTML entry and embedded interactive SVG
src/main.js                    Loads styles and app modules in dependency order
src/app.js                     Tabs, clock, panels, controls and local settings
src/engine.js                  Water totals, chart series and module metrics
src/sensors.js                 Sensor readings and leak-balance logic
src/pump-model.js              Flow-based energy and efficiency estimates
src/scenarios.js               Local retrofit proposal scaffold
src/components/                Charts and interactive building-network controls
src/platform/browser-bridge.js Local storage and browser fullscreen interface
src/styles/                    Responsive light blue-gray application theme
public/assets/                 Building photograph, logo and diagram artwork
public/data/datasets.js         Generated local data bundle used by the interface
data/*.json                    Editable building, profiles and 2026 baseline sources
data/*.csv                     Spreadsheet-friendly data exports
public/docs/                    Student-guide downloads
docs/                           Model notes and editable guide source
tools/                          Deterministic dataset builders
tests/                          Node built-in model and dataset checks
```

## Data and development notes

The default monitoring file contains 8,760 hourly periods for 2026. Values are integer centilitres per hourly interval. Main-meter values reconcile as `MAIN = OUTLET + LEAK`; floor meters and tenant/common-area channels are derived from the same underlying demand model. `data/building.json` and `data/retrofit_consumption_profiles.json` hold editable assumptions. `npm run data:build` regenerates the browser bundle at `public/data/datasets.js` and CSV exports from those JSON sources.

The browser stores interface preferences, draft retrofit proposals and uploaded monitoring scenarios locally. Uploaded data and draft scenarios do not overwrite the embedded baseline. To reset local saved settings, use the reset control in the app.

Use small modules when extending the project: add calculations under `src/`, connect them through a narrow UI boundary, and add focused checks under `tests/`. Keep scenario data separate from the baseline. See `docs/MODEL.md` for units, assumptions, balance rules and suggested extension points.

## Student guide

The app includes a step-by-step guide in **Notes for students** and a downloadable PDF. It covers cloning this repository, installing dependencies once, running `npm run dev`, making a small edit, and checking changes safely in Git.
