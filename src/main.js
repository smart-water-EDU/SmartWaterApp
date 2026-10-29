// Load styles before the UI modules so the first render is styled.
import './styles/styles.css';
import './styles/layout-extra.css';
import './styles/building-network.css';
// Active dashboard theme: palette, typography, panels and responsive layouts.
import './styles/control-room.css';
import './styles/instruments.css';
import './styles/calendar-clock.css';
import './styles/retrofit-editor.css';
import './styles/gauges.css';
import './styles/heat-recovery-designer.css';
import './styles/rainwater-designer.css';
import './styles/rainwater-consumption-charts.css';

// Each educational subsystem registers a documented API under window.SmartDrops.
import './platform/browser-bridge.js';
import './engine.js';
import './sensors.js';
import './scenarios.js';
import './pump-model.js';
import './components/charts.js';
import './components/network.js';
import './app.js';
