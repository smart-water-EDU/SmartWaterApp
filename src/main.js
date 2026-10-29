// Load styles before the UI modules so the first render is styled.
import './styles/styles.css';
import './styles/layout-extra.css';
import './styles/building-network.css';

// Each educational subsystem registers a documented API under window.SmartDrops.
import './platform/browser-bridge.js';
import './engine.js';
import './sensors.js';
import './scenarios.js';
import './pump-model.js';
import './components/charts.js';
import './components/network.js';
import './app.js';
