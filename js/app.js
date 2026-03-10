import { NeuralNetwork } from './neural-network.js';
import { Database } from './database.js';
import { GPSManager } from './gps.js';
import { MapManager } from './map.js';
import { UIManager } from './ui.js';

/**
 * Root application class - wires all modules together.
 */
class GPSNavigatorApp {
  constructor() {
    this.db = null;
    this.nn = null;
    this.gps = null;
    this.map = null;
    this.ui = null;
  }

  /** Full application bootstrap. */
  async init() {
    try {
      this._bootSequence();

      this.db = new Database();
      await this.db.init();

      this.nn = new NeuralNetwork(6, 8, 3);

      this.map = new MapManager();
      this.map.init();

      this.gps = new GPSManager(this.db, this.nn, this.map);

      this.ui = new UIManager(this.db, this.nn, this.gps, this.map);

      // Inject UI callbacks into GPS to avoid circular imports
      this.gps.setCallbacks({
        onAIUpdate: () => this.ui.updateAIStatus(),
        onPointsSaved: () => this.ui.loadPoints()
      });

      this.ui.setupEventListeners();

      // Initial online status
      this.ui._updateConnectionStatus(navigator.onLine);
      this.gps.setOnline(navigator.onLine);

      // Load persisted neural network
      const savedNN = await this.db.loadNeuralNetwork();
      if (savedNN) {
        this.nn.load(savedNN);
        console.log('Neural network loaded from DB');
      }

      // Set a random operator name
      document.getElementById('userName').textContent =
        'OPERATOR_' + Math.random().toString(36).substring(2, 7).toUpperCase();

      setTimeout(async () => {
        await this.ui.loadPoints();
        this.ui.updateAIStatus();
        if (this.map.markers.length > 0) {
          setTimeout(() => this.map.centerOnPoints(), 500);
        }
      }, 3000);

    } catch (error) {
      console.error("SYSTEM INITIALIZATION ERROR:", error);
      alert("> CRITICAL ERROR: SYSTEM INITIALIZATION FAILED\n> " + error);
    }
  }

  /** Display the boot sequence animation. */
  _bootSequence() {
    const bootScreen = document.getElementById('bootScreen');
    const bootText = document.getElementById('bootText');

    const bootMessages = [
      '> INITIALIZING GPS-NAVIGATOR SYSTEM...',
      '> LOADING KERNEL MODULES...',
      '> CHECKING HARDWARE COMPATIBILITY...',
      '> INITIALIZING GEOLOCATION API... OK',
      '> LOADING INDEXEDDB... OK',
      '> INITIALIZING GEOCODE CACHE... OK',
      '> INITIALIZING NEURAL NETWORK... OK',
      '> LOADING AI TRAINING DATA... OK',
      '> INITIALIZING LEAFLET MAP ENGINE... OK',
      '> LOADING TILE CACHE... OK',
      '> INITIALIZING OFFLINE MODE... OK',
      '> INITIALIZING SCREENSHOT MODULE... OK',
      '> ALL AI MODULES ACTIVE... OK',
      '> SYSTEM READY',
      '> WELCOME TO GPS-NAVIGATOR v3.0 AI',
      ''
    ];

    let delay = 0;
    bootMessages.forEach((msg, index) => {
      setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'boot-line';
        line.textContent = msg;
        line.style.animationDelay = '0s';
        bootText.appendChild(line);

        if (index === bootMessages.length - 1) {
          setTimeout(() => bootScreen.classList.add('hidden'), 500);
        }
      }, delay);
      delay += 150;
    });
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GPSNavigatorApp().init());
} else {
  new GPSNavigatorApp().init();
}
