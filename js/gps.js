import { CONFIG } from './config.js';
import { assessGPSQuality, applySmoothingFilter, normalizeInput, generateMapLinks, reverseGeocode, escapeHtml, validatePointName, debounce } from './utils.js';

/**
 * Manages all geolocation operations and GPS data collection.
 */
export class GPSManager {
  /**
   * @param {import('./database.js').Database} db
   * @param {import('./neural-network.js').NeuralNetwork} nn
   * @param {import('./map.js').MapManager} mapManager
   */
  constructor(db, nn, mapManager) {
    this.db = db;
    this.nn = nn;
    this.mapManager = mapManager;

    /** @type {number|null} */
    this.trackingId = null;
    this.isTracking = false;

    /** @type {{ lat: number, lng: number }|null} */
    this.currentUserPosition = null;

    /** @type {Object|null} */
    this.currentLocationData = null;

    /** @type {{ lat: number, lng: number }[]} */
    this.previousPositions = [];

    this.isOnline = navigator.onLine;

    /** @type {Function|null} Injected after UIManager is created */
    this._onAIUpdate = null;
    /** @type {Function|null} */
    this._onPointsSaved = null;

    this._debouncedTrackingUpdate = debounce(
      (position) => this._handleTrackingUpdate(position),
      CONFIG.MAP_UPDATE_DEBOUNCE
    );
  }

  /**
   * Inject UI callbacks to avoid circular imports.
   * @param {{ onAIUpdate: Function, onPointsSaved: Function }} callbacks
   */
  setCallbacks(callbacks) {
    this._onAIUpdate = callbacks.onAIUpdate || null;
    this._onPointsSaved = callbacks.onPointsSaved || null;
  }

  /**
   * Check geolocation permissions status.
   * @returns {Promise<string>} Permission state: 'granted', 'denied', or 'prompt'
   */
  async checkPermissions() {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });

      console.log('[GPS] Permission state:', result.state);

      if (result.state === 'denied') {
        throw new Error('GEOLOCATION PERMISSION DENIED IN BROWSER SETTINGS');
      }

      // Listen for permission changes
      result.addEventListener('change', () => {
        console.log('[GPS] Permission changed to:', result.state);
        if (result.state === 'denied') {
          alert('⚠️ GPS ACCESS WAS REVOKED! Enable it in browser settings.');
        }
      });

      return result.state;
    } catch (error) {
      console.error('[GPS] Permissions check failed:', error);
      // If Permissions API not supported, assume prompt state
      return 'prompt';
    }
  }

  /**
   * Update GPS status indicator in UI.
   * @param {string} status - 'idle', 'searching', 'active', 'error'
   * @param {string} text - Status text to display
   */
  _updateGPSStatus(status, text) {
    const statusEl = document.getElementById('gpsStatus');
    const statusTextEl = document.getElementById('gpsStatusText');

    if (statusEl && statusTextEl) {
      statusEl.className = `gps-status-indicator ${status}`;
      statusTextEl.textContent = text;
    }
  }

  /** Set online status. */
  setOnline(value) {
    this.isOnline = value;
  }

  /**
   * Handle a position update from the geolocation API.
   * Trains the neural network and saves training data.
   * @param {GeolocationPosition} position
   */
  _collectGPSDataForAI(position) {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const { latitude, longitude, accuracy, speed, altitude, heading } = position.coords;

    // Ensure all values are valid numbers, use defaults for null/undefined
    const safeSpeed = (speed !== null && speed !== undefined) ? speed : 0;
    const safeAltitude = (altitude !== null && altitude !== undefined) ? altitude : 0;
    const safeAccuracy = accuracy || 100; // Default to 100m if not provided

    this.db.saveAITrainingData({
      hour, dayOfWeek, latitude, longitude,
      accuracy: safeAccuracy,
      speed: safeSpeed,
      altitude: safeAltitude,
      timestamp: now.toISOString()
    });

    const inputs = normalizeInput(hour, dayOfWeek, latitude, longitude, safeAccuracy, safeSpeed);
    const targets = [
      Math.min(safeAccuracy / 100, 1),
      safeAccuracy < 30 ? 1 : 0,
      safeAccuracy > 50 ? 0 : 1
    ];

    this.nn.train(inputs, targets);

    if (this.nn.trainingCount % 10 === 0) {
      this.db.saveNeuralNetwork(this.nn.save());
      if (this._onAIUpdate) this._onAIUpdate();
    }
  }

  /**
   * Smooth the position and update the previousPositions buffer.
   * @param {GeolocationPosition} position
   * @returns {{ lat: number, lng: number }}
   */
  _smooth(position) {
    this.previousPositions.push({
      lat: position.coords.latitude,
      lng: position.coords.longitude
    });
    return applySmoothingFilter(
      position.coords.latitude,
      position.coords.longitude,
      this.previousPositions
    );
  }

  /**
   * Get current position, reverse-geocode it, and show it in the location modal.
   * Called by the [SHOW MY LOCATION] button.
   */
  async getLocationAndDisplay() {
    const outputEl = document.getElementById("output");
    outputEl.className = "info";
    outputEl.innerHTML = `&gt; ACQUIRING GPS SIGNAL (UP TO ${CONFIG.GPS_TIMEOUT / 1000}s)<span class="loading"></span>`;

  /**
   * Get current position and save it as a waypoint.
   * Called by the [GET COORDINATES AND SAVE] button.
   */
  async getLocationAndSave() {
    const outputEl = document.getElementById("output");
    const pointNameInput = document.getElementById("pointName");

    outputEl.className = "info";
    outputEl.innerHTML = `&gt; ACQUIRING GPS SIGNAL (UP TO ${CONFIG.GPS_TIMEOUT / 1000}s)<span class="loading"></span>`;

    // Check if running in secure context (HTTPS or localhost)
    if (!window.isSecureContext) {
      outputEl.className = "error";
      outputEl.innerHTML = `
        &gt; ERROR: GEOLOCATION REQUIRES SECURE CONTEXT<br>
        &gt; CURRENT: ${window.location.protocol}//${window.location.host}<br>
        &gt; REQUIRED: HTTPS or localhost<br>
        &gt; Please access via https:// or localhost
      `;
      this._updateGPSStatus('error', 'ERROR');
      return;
    }

    // Check permissions before requesting location
    const permissionState = await this.checkPermissions();
    if (permissionState === 'denied') {
      outputEl.className = "error";
      outputEl.innerHTML = `
        &gt; ERROR: GEOLOCATION PERMISSION DENIED<br>
        &gt; Please allow location access in browser settings
      `;
      this._updateGPSStatus('error', 'ERROR');
      return;
    }

    if (!navigator.geolocation) {
      outputEl.className = "error";
      outputEl.innerHTML = "&gt; ERROR: GEOLOCATION NOT SUPPORTED";
      this._updateGPSStatus('error', 'ERROR');
      return;
    }

    const pointNameValue = pointNameInput.value.trim();
    if (pointNameValue && !validatePointName(pointNameValue)) {
      outputEl.className = "error";
      outputEl.innerHTML = "&gt; ERROR: INVALID WAYPOINT NAME (MAX 100 CHARS)";
      return;
    }

    this._updateGPSStatus('searching', 'SEARCHING...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        this._collectGPSDataForAI(position);
        const smoothed = this._smooth(position);
        const { altitude, accuracy, speed, heading } = position.coords;
        const pointName = pointNameValue ||
          `WAYPOINT_${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}`;

        const point = {
          name: pointName,
          latitude: smoothed.lat, longitude: smoothed.lng,
          altitude: altitude || null, accuracy,
          speed: speed || null, heading: heading || null,
          timestamp: new Date().toISOString()
        };

        try {
          await this.db.savePoint(point);
          outputEl.className = "success";
          outputEl.innerHTML = `
            <strong>&gt; WAYPOINT SAVED SUCCESSFULLY</strong><br>
            &gt; NAME: ${escapeHtml(point.name)}<br>
            &gt; LAT: ${smoothed.lat.toFixed(6)} | LON: ${smoothed.lng.toFixed(6)}<br>
            ${altitude ? `&gt; ALT: ${altitude.toFixed(1)}m<br>` : ""}
            &gt; ACCURACY: ${accuracy.toFixed(1)}m (AI Smoothed)<br>
            ${speed !== null ? `&gt; SPEED: ${(speed * 3.6).toFixed(1)} km/h<br>` : ""}
            &gt; TIME: ${new Date(point.timestamp).toLocaleString("ru-RU")}
          `;
          pointNameInput.value = "";
          this._updateGPSStatus('active', 'LOCKED');
          if (this._onPointsSaved) this._onPointsSaved();
          if (this._onAIUpdate) this._onAIUpdate();
        } catch (error) {
          outputEl.className = "error";
          outputEl.innerHTML = `&gt; ERROR: ${escapeHtml(error.toString())}`;
          this._updateGPSStatus('error', 'ERROR');
        }
      },
      (error) => {
        this._handleGeolocationError(error, outputEl);
        this._updateGPSStatus('error', 'ERROR');
      },
      { enableHighAccuracy: true, timeout: CONFIG.GPS_TIMEOUT, maximumAge: 5000 }
    );
  }

  /**
   * Toggle continuous GPS tracking on/off.
   * Called by the [START TRACKING] / [STOP TRACKING] button.
   */
  async trackLocation() {
    const trackBtn = document.getElementById("trackBtn");
    const outputEl = document.getElementById("output");

    if (this.isTracking) {
      navigator.geolocation.clearWatch(this.trackingId);
      this.isTracking = false;
      trackBtn.innerHTML = "[START TRACKING]";
      trackBtn.className = "success";
      outputEl.className = "info";
      outputEl.innerHTML = "&gt; TRACKING STOPPED";
      this.currentUserPosition = null;
      this._updateGPSStatus('idle', 'IDLE');
      if (this._onPointsSaved) this._onPointsSaved();
      return;
    }

    // Check if running in secure context (HTTPS or localhost)
    if (!window.isSecureContext) {
      outputEl.className = "error";
      outputEl.innerHTML = `
        &gt; ERROR: GEOLOCATION REQUIRES SECURE CONTEXT<br>
        &gt; CURRENT: ${window.location.protocol}//${window.location.host}<br>
        &gt; REQUIRED: HTTPS or localhost<br>
        &gt; Please access via https:// or localhost
      `;
      this._updateGPSStatus('error', 'ERROR');
      return;
    }

    // Check permissions before requesting location
    const permissionState = await this.checkPermissions();
    if (permissionState === 'denied') {
      outputEl.className = "error";
      outputEl.innerHTML = `
        &gt; ERROR: GEOLOCATION PERMISSION DENIED<br>
        &gt; Please allow location access in browser settings
      `;
      this._updateGPSStatus('error', 'ERROR');
      return;
    }

    if (!navigator.geolocation) {
      outputEl.className = "error";
      outputEl.innerHTML = "&gt; ERROR: GEOLOCATION NOT SUPPORTED";
      this._updateGPSStatus('error', 'ERROR');
      return;
    }

    this.isTracking = true;
    trackBtn.innerHTML = "[STOP TRACKING]";
    trackBtn.style.borderColor = "var(--terminal-red)";
    trackBtn.style.color = "var(--terminal-red)";
    this._updateGPSStatus('searching', 'SEARCHING...');

    this.trackingId = navigator.geolocation.watchPosition(
      (position) => this._debouncedTrackingUpdate(position),
      (error) => {
        this._handleGeolocationError(error, outputEl);
        this.isTracking = false;
        trackBtn.innerHTML = "[START TRACKING]";
        trackBtn.className = "success";
        trackBtn.style.borderColor = "";
        trackBtn.style.color = "";
        this._updateGPSStatus('error', 'ERROR');
      },
      { enableHighAccuracy: true, timeout: CONFIG.TRACKING_TIMEOUT, maximumAge: 1000 }
    );
  }

  /** @private */
  _handleTrackingUpdate(position) {
    this._collectGPSDataForAI(position);
    const smoothed = this._smooth(position);
    const { accuracy, speed } = position.coords;
    const outputEl = document.getElementById("output");
    const quality = assessGPSQuality(accuracy);

    outputEl.className = "success";
    outputEl.innerHTML = `
      <strong>&gt; TRACKING ACTIVE [${quality.text}] 🤖 AI ACTIVE</strong><br>
      &gt; LAT: ${smoothed.lat.toFixed(6)} | LON: ${smoothed.lng.toFixed(6)}<br>
      &gt; ACCURACY: ${accuracy.toFixed(1)}m (AI Smoothed)<br>
      ${speed !== null ? `&gt; SPEED: ${(speed * 3.6).toFixed(1)} km/h<br>` : ""}
      &gt; UPDATED: ${new Date().toLocaleTimeString("ru-RU")}
    `;

    this.currentUserPosition = { lat: smoothed.lat, lng: smoothed.lng };
    this.mapManager.updateCurrentLocationMarker(smoothed.lat, smoothed.lng, accuracy);
    this._updateGPSStatus('active', 'LOCKED');

    if (this._onPointsSaved) this._onPointsSaved();
    if (this._onAIUpdate) this._onAIUpdate();
  }

  /**
   * @private
   * Handle geolocation errors with detailed user guidance
   */
  _handleGeolocationError(error, outputEl) {
    outputEl.className = "error";

    console.error('[GPS] Error code:', error.code);
    console.error('[GPS] Error message:', error.message);
    console.error('[GPS] Full error:', error);

    switch (error.code) {
      case error.PERMISSION_DENIED:
        outputEl.innerHTML = `
          <strong>&gt; ERROR: GEOLOCATION ACCESS DENIED</strong><br>
          &gt; <span style="color: var(--terminal-amber);">STEPS TO FIX:</span><br>
          &gt; 1. Look for 🔒 icon in browser address bar<br>
          &gt; 2. Click it → Site Settings → Location<br>
          &gt; 3. Change to "Allow"<br>
          &gt; 4. Reload page (F5)<br>
          <br>
          &gt; <strong>Chrome/Edge:</strong> Settings → Privacy → Site Settings → Location<br>
          &gt; <strong>Firefox:</strong> Page Info (Ctrl+I) → Permissions → Location<br>
          &gt; <strong>Safari:</strong> Safari → Settings → Websites → Location
        `;
        break;

      case error.POSITION_UNAVAILABLE:
        outputEl.innerHTML = `
          <strong>&gt; ERROR: POSITION UNAVAILABLE</strong><br>
          &gt; <span style="color: var(--terminal-amber);">POSSIBLE CAUSES:</span><br>
          &gt; • You are indoors (GPS needs clear sky view)<br>
          &gt; • Location services disabled on device<br>
          &gt; • GPS hardware malfunction<br>
          &gt; • No GPS satellites in range<br>
          <br>
          &gt; <span style="color: var(--terminal-green);">TRY THIS:</span><br>
          &gt; • Move closer to window or go outdoors<br>
          &gt; • Enable Location Services in device settings<br>
          &gt; • Check if GPS works in Google Maps<br>
          &gt; • Restart browser/device
        `;
        break;

      case error.TIMEOUT:
        outputEl.innerHTML = `
          <strong>&gt; ERROR: GPS TIMEOUT (${CONFIG.GPS_TIMEOUT / 1000} seconds)</strong><br>
          &gt; <span style="color: var(--terminal-amber);">This is NORMAL for first GPS fix!</span><br>
          <br>
          &gt; GPS satellites need time to acquire signal.<br>
          &gt; First fix can take 30-90 seconds, especially indoors.<br>
          <br>
          &gt; <span style="color: var(--terminal-green);">RECOMMENDATIONS:</span><br>
          &gt; • Wait 30 seconds and try again<br>
          &gt; • Move to location with clear sky view<br>
          &gt; • Ensure device GPS is enabled<br>
          &gt; • Try [START TRACKING] for continuous updates
        `;
        break;

      default:
        outputEl.innerHTML = `
          <strong>&gt; ERROR: UNKNOWN GEOLOCATION ERROR</strong><br>
          &gt; Code: ${error.code}<br>
          &gt; Message: ${escapeHtml(error.message)}<br>
          <br>
          &gt; Please check browser console (F12) for details
        `;
    }
  }

  /**
   * @private
   * Generate the HTML content for the location display modal.
   */
  _generateLocationHTML(lat, lng, alt, acc, timestamp, cityName, address, links, fromCache) {
    const quality = assessGPSQuality(acc);
    return `
      <h3>&gt;&gt; CURRENT LOCATION DATA &lt;&lt;</h3>
      <div class="here-now-banner">📍 Я СЕЙЧАС ЗДЕСЬ 📍</div>
      <div class="city-name" id="displayCity">${escapeHtml(cityName)}</div>
      <div class="gps-quality ${quality.class}" id="gpsQuality">
        &gt; GPS SIGNAL: <span id="gpsQualityText">${quality.text}</span>
      </div>
      <div class="coord-line">
        &gt; LATITUDE: <span class="coord-value" id="displayLat">${lat.toFixed(6)}</span>
      </div>
      <div class="coord-line">
        &gt; LONGITUDE: <span class="coord-value" id="displayLng">${lng.toFixed(6)}</span>
      </div>
      <div class="coord-line">
        &gt; ALTITUDE: <span class="coord-value" id="displayAlt">${alt ? alt.toFixed(1) + 'm' : 'N/A'}</span>
      </div>
      <div class="coord-line">
        &gt; ACCURACY: <span class="coord-value" id="displayAcc">${acc.toFixed(1)}m</span>
      </div>
      <div class="coord-line">
        &gt; TIMESTAMP: <span class="coord-value" id="displayTime">${new Date(timestamp).toLocaleString("ru-RU")}</span>
      </div>
      <div class="address-section">
        <h4 style="color: var(--terminal-amber); margin-bottom: 10px;">
          &gt; FULL ADDRESS:
          <span id="addressCachedBadge">${fromCache ? '<span class="cached-badge">CACHED</span>' : ''}</span>
        </h4>
        <div class="address-full" id="displayAddress">${escapeHtml(address)}</div>
      </div>
      <div class="link-section">
        <h4>&gt; UNIVERSAL MAP LINKS:</h4>
        <div class="link-item">
          <strong>&gt; Google Maps:</strong><br>
          <a href="${links.google}" id="googleMapsLink" target="_blank" rel="noopener noreferrer">${links.google}</a>
          <button class="copy-btn" data-copy-target="googleMapsLink">[COPY]</button>
        </div>
        <div class="link-item">
          <strong>&gt; Yandex Maps:</strong><br>
          <a href="${links.yandex}" id="yandexMapsLink" target="_blank" rel="noopener noreferrer">${links.yandex}</a>
          <button class="copy-btn" data-copy-target="yandexMapsLink">[COPY]</button>
        </div>
        <div class="link-item">
          <strong>&gt; OpenStreetMap:</strong><br>
          <a href="${links.osm}" id="osmLink" target="_blank" rel="noopener noreferrer">${links.osm}</a>
          <button class="copy-btn" data-copy-target="osmLink">[COPY]</button>
        </div>
        <div class="link-item">
          <strong>&gt; 2GIS:</strong><br>
          <a href="${links.twoGis}" id="twoGisLink" target="_blank" rel="noopener noreferrer">${links.twoGis}</a>
          <button class="copy-btn" data-copy-target="twoGisLink">[COPY]</button>
        </div>
        <div class="link-item">
          <strong>&gt; Apple Maps:</strong><br>
          <a href="${links.apple}" id="appleMapsLink" target="_blank" rel="noopener noreferrer">${links.apple}</a>
          <button class="copy-btn" data-copy-target="appleMapsLink">[COPY]</button>
        </div>
        <div class="link-item">
          <strong>&gt; Geo URI (Universal):</strong><br>
          <a href="${links.geo}" id="geoUri" target="_blank" rel="noopener noreferrer">${links.geo}</a>
          <button class="copy-btn" data-copy-target="geoUri">[COPY]</button>
        </div>
      </div>
      <div class="share-buttons">
        <button data-action="screenshot" class="success">[CAPTURE SCREENSHOT]</button>
        <button data-action="shareLocation" class="export-btn">[SHARE LOCATION]</button>
        <button data-action="copyAll" class="success">[COPY ALL DATA]</button>
      </div>
    `;
  }
}
