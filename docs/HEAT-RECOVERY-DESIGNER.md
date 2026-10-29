# Heat-recovery studio

Open **Development → Additional Systems → Sewage Heat Recovery**, or click the exchanger symbol with the sewage layer enabled.

## Single-view layout

The desktop window fits the viewport without scrolling. Larger exchanger cards sit above one horizontal row of smaller consumer cards. The canvas occupies about 60% of the desktop body, approximately 20% narrower than the preceding layout. Consumer nodes use a full-height icon on the left and editable text/output on the right. On phone-size windows, the compact library sits above the canvas, still within one view.

The header holds four equal-size gauges, consumer count and total allocation. The previous recovered-power and rated-capacity header cards have been removed. The gauges show estimated electrical input in kW, sewage temperature in °C, and year-to-date electrical/thermal energy in kWh. These are model estimates, not an electricity-meter reading. **Clear**, **Close** and **Save design** are stacked at its upper right. The former side inspector, percentage inputs on consumer cards, lower summary, notes form and footer have been removed.

## Building a design

1. Click an exchanger card to add/replace the exchanger, or drag its thumbnail onto the canvas. Plate, shell-and-tube and spiral types use the editable teaching presets in `data/heat_recovery_presets.json`. The cards show effectiveness without kW ratings. Teaching capacity limits, pressure drop and temperature data remain in the underlying presets and model; they are not presented as manufacturer ratings.
2. Click or drag a heat-use card to add a consumer. Repeat to add more consumers of the same kind. The badge shows the number of instances. Available purposes are water preheating, ventilation-air preheating, space heating and thermal storage.
3. Move nodes by dragging them. Their wires and percentage inputs follow. **Arrange** resets the layout. Focus a node and use arrow keys to move it (1% per key; Shift = 5%).
4. Set each consumer's percentage **on its incoming wire**. Allocations across every consumer must total 100% before saving. Header totals update while typing. **Balance** normalizes the current proportions in exact tenths of a percent. Adding/removing consumers rebalances automatically.
5. Edit a consumer's name directly on its node. Use the node's × button, or Delete/Backspace on a focused node, to remove it. The exchanger is replaced by selecting another type; Clear removes the entire draft network.
6. Select another exchanger preset if needed. **Save design** validates and saves the complete configuration. Close or Escape discards changes made since opening. Saved designs, including custom node positions, restore on reopening or reloading.

Wire percentage controls are placed along their associated curves, preferring clear portions away from equipment nodes and other labels. Palette dragging supports mouse and touch with a floating thumbnail. All add operations also work with buttons.

## Persistence and unchanged design parameters

The design is saved under `smart-drops-heat-recovery-design-v1` in localStorage, with a copy in the app's Additional Systems settings. Saving reports a storage failure instead of claiming success. Storage is local to the browser profile and origin, with no account, database or remote API.

The redesigned window preserves existing source conditions, pressure-drop/temperature assumptions, consumer specifications and saved notes in the design object even though the side inspector and notes form are gone. New designs initialize these values from the preset catalog and selected simulation hour. Students can extend the model or preset catalog to expose additional controls later. Existing text specifications remain in Additional Systems settings. Rainwater collection keeps its own independent window.

## Educational preview

```
potential kW = wastewater L/min ÷ 60 × 4.186 × max(0, inlet °C − outlet °C)
recovered kW = min(rated capacity kW, potential kW × effectiveness % ÷ 100)
consumer allocated kW = recovered kW × consumer share % ÷ 100
```

The 4.186 factor assumes water-like density and heat capacity. This is a source-heat allocation preview, not a complete thermal simulation. Consumer-load matching, heat-pump lift, fouling, distribution losses and storage operation remain student extensions. Saving a thermal design does not change the water-monitoring baseline or claim actual building savings. Presets are illustrative teaching assumptions, not manufacturer specifications.

## Student extension files

- `data/heat_recovery_presets.json`: equipment and purpose presets.
- `src/heat-recovery-model.js`: pure allocation, layout, validation and preview functions.
- `src/heat-recovery-storage.js`: validated local save/load.
- `src/components/heat-recovery-designer.js`: split-view UI, wire allocation controls and pointer dragging.
- `src/styles/heat-recovery-designer.css`: scoped responsive studio styles.
- `tests/heat-recovery.test.js`: model and persistence checks.
- `src/app.js`: `STUDENT EXTENSION: VISUAL HEAT RECOVERY STUDIO` integration block.

Keep additional thermal calculations in separate modules and connect them through these interfaces, preserving unrelated charts, sensors, layers and the baseline dataset.

## Generated thumbnails

Seven transparent PNGs live in `public/assets/heat-recovery/`: `plate-exchanger.png`, `tubular-exchanger.png`, `spiral-exchanger.png`, `water-preheat.png`, `ventilation-preheat.png`, `space-heating.png` and `thermal-storage.png`. They were generated with built-in imagegen as blue/orange engineering clipart. `generation-prompts.json` in that folder records the exact prompts. They are symbolic illustrations, not manufacturer product images.

## Header gauges and year-to-date energy

Four equal-size gauges show the selected-hour water-heater electrical input (kW), selected-hour sewage temperature (°C), baseline heater electrical energy (kWh) and recovered thermal heat (kWh). Effectiveness is selected through the equipment presets; its former header input and the explanatory texts below the heater gauge are removed. The energy gauges integrate the shared hourly sensors from January 1 through the selected simulation hour, inclusive. Future hours are excluded.

The stored S-TE-HW-HEATER channel is useful thermal energy per hourly period, not measured electricity. Baseline electricity is useful thermal kWh / 0.98, using an educational direct-electric heater efficiency assumption. For each one-hour period:

```
potential thermal kWh = sewage L/min / 60 × 4.186 × max(0, sewage °C − cold °C)
recovered thermal kWh = min(0.40 × baseline electric kWh, potential × exchanger effectiveness, exchanger kW limit × 1 h)
remaining electric kWh = (useful heater kWh − min(useful heater kWh, recovered × water-preheat share)) / 0.98
```

Recovery requires a placed exchanger and at least one connected consumer. The 40% fraction is an explicit teaching target, capped by available sewage heat and equipment capacity. The supplied annual data gives about 39.1% for the default plate exchanger. It is not a measured saving and is not guaranteed under other scenarios. The kWh gauges compare recovered thermal energy with baseline electrical energy; these are distinct physical quantities and labeled as such. Only water-preheating allocations offset the water-heater electrical input; other consumers require their own demand models. Canvas power values use the final hour of the same calculation.

See heatEnergySummary in src/heat-recovery-model.js, app integration in src/app.js, and tests/heat-energy.test.js. The earlier heaterElectricityPreview helper remains available for students but the current header uses the hourly year-to-date model. Saving the design does not alter baseline meters or apply proposed savings to Monitoring.
