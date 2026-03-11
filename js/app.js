import { NeuralNetwork } from './neural-network.js';
import { Database } from './database.js';
import { GPSManager } from './gps.js';
import { MapManager } from './map.js';
import { UIManager } from './ui.js';
import { PWAInstaller } from './pwa-install.js';
import { MapTilePrefetcher } from './map-prefetcher.js';

// Global error boundaries
window.addEventListener('unhandledrejection', (event) => {
  console.error('[APP] Unhandled Promise Rejection:', event.reason);
  event.preventDefault();

  const errorMsg = document.createElement('div');
  errorMsg.className = 'global-error';

  const warning = document.createElement('strong');
  warning.textContent = '⚠️ SYSTEM WARNING: ';

  const msgText = document.createTextNode(
    event.reason?.message || 'Unknown error occurred'
  );

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'DISMISS';
  dismissBtn.addEventListener('click', () => errorMsg.remove());

  errorMsg.appendChild(warning);
  errorMsg.appendChild(msgText);
  errorMsg.appendChild(document.createTextNode(' '));
  errorMsg.appendChild(dismissBtn);
  document.body.appendChild(errorMsg);
});

window.addEventListener('error', (event) => {
  console.error('[APP] Uncaught Error:', event.error);
});

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
    this.mapPrefetcher = null;
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

      // Initialize PWA installer
      const pwaInstaller = new PWAInstaller();
      pwaInstaller.init();
      console.log('[APP] PWA installer initialized');

      // Initialize map prefetcher
      this.mapPrefetcher = new MapTilePrefetcher();
      window.mapPrefetcher = this.mapPrefetcher;
      console.log('[APP] Map prefetcher initialized');

      // Update cache stats on load
      this.updateCacheStats();

      // Setup offline map controls
      this.setupOfflineMapControls();

      // Initial online status
      this.ui._updateConnectionStatus(navigator.onLine);
      this.gps.setOnline(navigator.onLine);

      // Load persisted neural network
      const savedNN = await this.db.loadNeuralNetwork();
      if (savedNN) {
        this.nn.load(savedNN);
        console.log('Neural network loaded from DB');
      }

      // Check GPS permissions on load
      await this.checkInitialGPSStatus();

      // Set a random operator name
      document.getElementById('userName').textContent =
        'OPERATOR_' + Math.random().toString(36).substring(2, 7).toUpperCase();

      // Log GPS diagnostic information
      this.logGPSDiagnostics();

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

  /** Update cached tile count display. */
  async updateCacheStats() {
    const stats = await this.mapPrefetcher.getCacheStats();
    const countEl = document.getElementById('cachedTilesCount');
    const sizeEl = document.getElementById('storageUsed');

    if (countEl) countEl.textContent = stats.count;
    if (sizeEl) sizeEl.textContent = stats.sizeMB;
  }

  /**
   * Log GPS diagnostic information for debugging
   */
  logGPSDiagnostics() {
    console.log('╔════════════════════════════════════╗');
    console.log('║    GPS DIAGNOSTICS v3.0           ║');
    console.log('╚════════════════════════════════════╝');
    console.log('Secure Context (HTTPS):', window.isSecureContext);
    console.log('Protocol:', window.location.protocol);
    console.log('Hostname:', window.location.hostname);
    console.log('Full URL:', window.location.href);
    console.log('───────────────────────────────────');
    console.log('Geolocation API:', 'geolocation' in navigator ? '✅ Available' : '❌ Not available');
    console.log('Permissions API:', 'permissions' in navigator ? '✅ Available' : '⚠️ Not available');
    console.log('Service Worker:', 'serviceWorker' in navigator ? '✅ Available' : '❌ Not available');
    console.log('───────────────────────────────────');
    console.log('User Agent:', navigator.userAgent);
    console.log('Online status:', navigator.onLine ? '🌐 ONLINE' : '📴 OFFLINE');
    console.log('Platform:', navigator.platform);
    console.log('Language:', navigator.language);
    console.log('════════════════════════════════════');
  }

  /**
   * Check GPS status and permissions on application load
   */
  async checkInitialGPSStatus() {
    try {
      console.log('[APP] Checking initial GPS permissions...');
      const permissionState = await this.gps.checkPermissions();
      console.log('[APP] Initial GPS permission state:', permissionState);

      const aiStatusEl = document.getElementById('aiStatus');

      if (permissionState === 'denied') {
        if (aiStatusEl) {
          aiStatusEl.textContent = 'WAITING FOR GPS PERMISSION';
          aiStatusEl.style.color = 'var(--terminal-red)';
        }

        // Show a non-intrusive warning
        const outputEl = document.getElementById('output');
        if (outputEl) {
          outputEl.className = 'warning';
          outputEl.innerHTML = '&gt; ⚠️ GPS PERMISSION DENIED - Grant access to enable location features';
        }
      } else if (permissionState === 'prompt') {
        if (aiStatusEl) {
          aiStatusEl.textContent = 'READY (Permission required)';
        }
      } else {
        if (aiStatusEl) {
          aiStatusEl.textContent = 'READY';
          aiStatusEl.style.color = 'var(--terminal-green)';
        }
      }
    } catch (error) {
      console.error('[APP] Could not check GPS permissions:', error);
    }
  }

  /** Wire up the offline map download buttons. */
  setupOfflineMapControls() {
    // Download current area
    document.getElementById('downloadCurrentAreaBtn')?.addEventListener('click', async () => {
      await this.mapPrefetcher.prefetchCurrentLocation();
      await this.updateCacheStats();
    });

    // Download custom area
    document.getElementById('downloadCustomAreaBtn')?.addEventListener('click', async () => {
      const lat = prompt('> Enter LATITUDE (e.g., 55.7558):');
      const lon = prompt('> Enter LONGITUDE (e.g., 37.6173):');

      if (lat && lon) {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);

        if (!isNaN(latNum) && !isNaN(lonNum)) {
          await this.mapPrefetcher.prefetchArea(latNum, lonNum);
          await this.updateCacheStats();
        } else {
          alert('> ERROR: Invalid coordinates');
        }
      }
    });

    // View cache stats
    document.getElementById('viewCacheStatsBtn')?.addEventListener('click', async () => {
      const stats = await this.mapPrefetcher.getCacheStats();
      alert(`> MAP CACHE STATISTICS:\n\n> Tiles cached: ${stats.count}\n> Storage used: ~${stats.sizeMB} MB\n\n> These tiles are available offline!`);
    });

    // Clear map cache
    document.getElementById('clearMapCacheBtn')?.addEventListener('click', async () => {
      if (confirm('> Are you sure you want to delete all cached map tiles?')) {
        const cache = await caches.open('gps-nav-map-tiles-v2');
        const keys = await cache.keys();

        for (const request of keys) {
          await cache.delete(request);
        }

        await this.updateCacheStats();
        alert('> Map cache cleared successfully');
      }
    });
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

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('> SERVICE WORKER REGISTERED:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('> NEW VERSION AVAILABLE - RELOAD TO UPDATE');
              if (confirm('New version available! Reload to update?')) {
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((error) => {
        console.error('> SERVICE WORKER REGISTRATION FAILED:', error);
      });
  });
} else {
  console.warn('> SERVICE WORKERS NOT SUPPORTED');
}
