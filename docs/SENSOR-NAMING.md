# Instrument tags and tank data

Every sensor CSV column and instrument balloon uses **`S-[type]-[position]`**. A position can contain a floor, module ID or equipment location. For example, `S-CWF-L5` is the floor-5 cold-water flow sensor; `S-TWF-L5-01` is the combined cold/hot meter for module L5-01.

| Type | Quantity | Example | Unit |
| --- | --- | --- | --- |
| CWF | Cold-water flow | S-CWF-L5 | L/min |
| HWF | Hot-water flow | S-HWF-L5 | L/min |
| TWF | Total module water flow | S-TWF-L1-01 | L/min |
| WWF | Wastewater flow | S-WWF-TANK-IN / S-WWF-TANK-OUT | L/min |
| RWF | Rainwater flow, currently unavailable | S-RWF-ROOF | L/min |
| CWT / HWT / WWT | Cold / hot / wastewater temperature | S-HWT-SUPPLY | °C |
| CWP / HWP | Cold / hot-water pressure rise | S-CWP-PUMP | bar |
| EE | Electrical energy per hourly period | S-EE-CW-PUMP | kWh/hour |
| TE | Thermal energy per hourly period | S-TE-HW-HEATER | kWh/hour |
| PWR | Average pump electrical power | S-PWR-HW-PUMP | kW |
| WWL | Wastewater tank level at hour end | S-WWL-TANK | % |

Leak investigation uses `S-CWF-MAIN-IN`, `S-CWF-MAIN-OUT` and `S-CWF-BRANCH`. Floor/module selection remains independent of opening an instrument balloon. Balloons emphasize the actual reading and tag, with a small scale and one horizontal row of one to three secondary values. Balloons do not show timestamps. Flow/energy/power scales extend to the rounded 2026 channel peak × 1.1; temperature and level use 0–100, pressure 0–6 bar. These scales are display ranges, not alarm thresholds.

`src/sensor-tags.js` owns the convention and compatibility aliases. `src/data-model.js` generates the 69 current sensor channels, `src/diagram-readings.js` retrieves them, and `src/components/instrument-gauge.js` presents them. Earlier local scenarios are upgraded by regenerating their sensor table; their module/common water columns and building edits are preserved. Compatibility aliases are for earlier code/storage only; CSV headers and displayed instrument names use the new tags.

## Sewage tank assumptions

The tank is a simplified educational storage model, not an actual installation or measurement. Capacity: **2,000 L**. Initial stored volume: **800 L**. Nominal residence time: **1.5 h**. Each hourly inlet equals legitimate tenant/common cold plus hot water; mains leakage is excluded.

```
available L = previous stored L + hourly wastewater inlet L
outlet L = max(available × (1 − exp(−1 / 1.5)), available − capacity)
stored L = available − outlet L
level % = stored L / capacity × 100
```

The capacity term includes overflow in outlet flow. Therefore every hour satisfies `previous storage + inlet − outlet = current storage`, and level stays between 0 and 100%. The tank annotations show end-of-hour level and hourly-average inlet/outlet flow; they remain current readings when the module accumulation mode is selected. Click a value to open its gauge. Tank storage is downstream of the main-water balance; the original module loads and main leak events are unchanged. Scenario Apply regenerates tank readings from the active water loads.
