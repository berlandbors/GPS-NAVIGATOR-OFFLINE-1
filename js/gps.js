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
    const { latitude, longitude, accuracy, speed } = position.coords;

    this.db.saveAITrainingData({
      hour, dayOfWeek, latitude, longitude, accuracy, speed: speed || 0,
      timestamp: now.toISOString()
    });

    const inputs = normalizeInput(hour, dayOfWeek, latitude, longitude, accuracy, speed || 0);
    const targets = [
      Math.min(accuracy / 100, 1),
      accuracy < 30 ? 1 : 0,
      accuracy > 50 ? 0 : 1
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
  getLocationAndDisplay() {
    const outputEl = document.getElementById("output");
    outputEl.className = "info";
    outputEl.innerHTML = '&gt; ACQUIRING GPS SIGNAL (UP TO 30s)<span class="loading"></span>';

    if (!navigator.geolocation) {
      outputEl.className = "error";
      outputEl.innerHTML = "&gt; ERROR: GEOLOCATION NOT SUPPORTED";
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        this._collectGPSDataForAI(position);
        const smoothed = this._smooth(position);
        const { altitude, accuracy, speed, heading } = position.coords;
        const { timestamp } = position;

        this.currentLocationData = {
          lat: smoothed.lat, lng: smoothed.lng,
          alt: altitude, acc: accuracy,
          speed, heading, timestamp
        };

        const links = generateMapLinks(smoothed.lat, smoothed.lng);
        const geocodeResult = await reverseGeocode(smoothed.lat, smoothed.lng, this.db, this.isOnline);

        const htmlContent = this._generateLocationHTML(
          smoothed.lat, smoothed.lng, altitude, accuracy, timestamp,
          geocodeResult.cityName, geocodeResult.fullAddress, links, geocodeResult.fromCache
        );

        document.getElementById('locationDisplayContent').innerHTML = htmlContent;
        document.getElementById('locationModal').classList.add('active');

        outputEl.className = "success";
        outputEl.innerHTML = "&gt; LOCATION DATA ACQUIRED SUCCESSFULLY (Click [SHOW MY LOCATION] to view again)";

        this.currentUserPosition = { lat: smoothed.lat, lng: smoothed.lng };
        this.mapManager.updateCurrentLocationMarker(smoothed.lat, smoothed.lng, accuracy);
        this.mapManager.map.setView([smoothed.lat, smoothed.lng], 15);

        if (this._onAIUpdate) this._onAIUpdate();
      },
      (error) => this._handleGeolocationError(error, outputEl),
      { enableHighAccuracy: true, timeout: CONFIG.GPS_TIMEOUT, maximumAge: 0 }
    );
  }

  /**
   * Get current position and save it as a waypoint.
   * Called by the [GET COORDINATES AND SAVE] button.
   */
  getLocationAndSave() {
    const outputEl = document.getElementById("output");
    const pointNameInput = document.getElementById("pointName");

    outputEl.className = "info";
    outputEl.innerHTML = '&gt; ACQUIRING GPS SIGNAL (UP TO 30s)<span class="loading"></span>';

    if (!navigator.geolocation) {
      outputEl.className = "error";
      outputEl.innerHTML = "&gt; ERROR: GEOLOCATION NOT SUPPORTED";
      return;
    }

    const pointNameValue = pointNameInput.value.trim();
    if (pointNameValue && !validatePointName(pointNameValue)) {
      outputEl.className = "error";
      outputEl.innerHTML = "&gt; ERROR: INVALID WAYPOINT NAME (MAX 100 CHARS)";
      return;
    }

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
          if (this._onPointsSaved) this._onPointsSaved();
          if (this._onAIUpdate) this._onAIUpdate();
        } catch (error) {
          outputEl.className = "error";
          outputEl.innerHTML = `&gt; ERROR: ${escapeHtml(error.toString())}`;
        }
      },
      (error) => this._handleGeolocationError(error, outputEl),
      { enableHighAccuracy: true, timeout: CONFIG.GPS_TIMEOUT, maximumAge: 0 }
    );
  }

  /**
   * Toggle continuous GPS tracking on/off.
   * Called by the [START TRACKING] / [STOP TRACKING] button.
   */
  trackLocation() {
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
      if (this._onPointsSaved) this._onPointsSaved();
      return;
    }

    if (!navigator.geolocation) {
      outputEl.className = "error";
      outputEl.innerHTML = "&gt; ERROR: GEOLOCATION NOT SUPPORTED";
      return;
    }

    this.isTracking = true;
    trackBtn.innerHTML = "[STOP TRACKING]";
    trackBtn.style.borderColor = "var(--terminal-red)";
    trackBtn.style.color = "var(--terminal-red)";

    this.trackingId = navigator.geolocation.watchPosition(
      (position) => this._debouncedTrackingUpdate(position),
      (error) => {
        this._handleGeolocationError(error, outputEl);
        this.isTracking = false;
        trackBtn.innerHTML = "[START TRACKING]";
        trackBtn.className = "success";
        trackBtn.style.borderColor = "";
        trackBtn.style.color = "";
      },
      { enableHighAccuracy: true, timeout: CONFIG.TRACKING_TIMEOUT, maximumAge: 0 }
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

    if (this._onPointsSaved) this._onPointsSaved();
    if (this._onAIUpdate) this._onAIUpdate();
  }

  /** @private */
  _handleGeolocationError(error, outputEl) {
    outputEl.className = "error";
    switch (error.code) {
      case error.PERMISSION_DENIED:
        outputEl.innerHTML = "&gt; ERROR: GEOLOCATION ACCESS DENIED<br>&gt; GRANT PERMISSION IN BROWSER SETTINGS";
        break;
      case error.POSITION_UNAVAILABLE:
        outputEl.innerHTML = "&gt; ERROR: POSITION UNAVAILABLE<br>&gt; CHECK GPS SETTINGS<br>&gt; TRY MOVING TO OPEN AREA";
        break;
      case error.TIMEOUT:
        outputEl.innerHTML = "&gt; ERROR: GPS TIMEOUT<br>&gt; SIGNAL ACQUISITION TAKING TOO LONG<br>&gt; RETRY IN OPEN AREA";
        break;
      default:
        outputEl.innerHTML = "&gt; ERROR: UNKNOWN GEOLOCATION ERROR";
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
