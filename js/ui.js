import { CONFIG } from './config.js';
import { escapeHtml, calculateDistance, formatDistance, normalizeInput, generateMapLinks, applySmoothingFilter } from './utils.js';

/**
 * Manages the UI: event listeners, modals, points list, AI stats, screenshots.
 */
export class UIManager {
  /**
   * @param {import('./database.js').Database} db
   * @param {import('./neural-network.js').NeuralNetwork} nn
   * @param {import('./gps.js').GPSManager} gps
   * @param {import('./map.js').MapManager} mapManager
   */
  constructor(db, nn, gps, mapManager) {
    this.db = db;
    this.nn = nn;
    this.gps = gps;
    this.map = mapManager;

    /** @type {Blob|null} */
    this.screenshotBlob = null;
  }

  /** Attach all event listeners (replaces all onclick attributes). */
  setupEventListeners() {
    // Screenshot modal controls
    document.querySelector('#screenshotModal .close-modal')
      .addEventListener('click', () => this.closeScreenshotModal());
    document.getElementById('downloadScreenshotBtn')
      .addEventListener('click', () => this.downloadScreenshot());
    document.getElementById('shareScreenshotBtn')
      .addEventListener('click', () => this.shareScreenshot());

    // Location modal close
    document.querySelector('#locationModal .close-modal')
      .addEventListener('click', () => this.closeLocationModal());

    // AI section buttons
    document.getElementById('showAIStatsBtn')
      .addEventListener('click', () => this.showAIStats());
    document.getElementById('trainNNBtn')
      .addEventListener('click', () => this.trainNeuralNetwork());
    document.getElementById('resetAIBtn')
      .addEventListener('click', () => this.resetAI());

    // GPS controls
    document.getElementById('getLocationSaveBtn')
      .addEventListener('click', () => this.gps.getLocationAndSave());
    document.getElementById('trackBtn')
      .addEventListener('click', () => this.gps.trackLocation());
    document.getElementById('getLocationDisplayBtn')
      .addEventListener('click', () => this.gps.getLocationAndDisplay());

    // Map controls
    document.getElementById('centerMapBtn')
      .addEventListener('click', () => this.map.centerOnPoints());
    document.getElementById('currentLocationMapBtn')
      .addEventListener('click', () => this._getCurrentLocationOnMap());
    document.getElementById('toggleMapTypeBtn')
      .addEventListener('click', () => this.map.toggleMapType());

    // Points database controls
    document.getElementById('loadPointsBtn')
      .addEventListener('click', () => this.loadPoints());
    document.getElementById('exportPointsBtn')
      .addEventListener('click', () => this.exportPoints());
    document.getElementById('clearAllPointsBtn')
      .addEventListener('click', () => this.clearAllPoints());

    // Event delegation: location modal content (copy buttons + action buttons)
    document.getElementById('locationDisplayContent')
      .addEventListener('click', (e) => this._handleLocationModalClick(e));

    // Event delegation: points list (show on map / delete)
    document.getElementById('pointsList')
      .addEventListener('click', (e) => this._handlePointsListClick(e));

    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
      if (event.target === document.getElementById('screenshotModal')) {
        this.closeScreenshotModal();
      }
      if (event.target === document.getElementById('locationModal')) {
        this.closeLocationModal();
      }
    });

    // Online/offline status
    window.addEventListener('online', () => {
      this.gps.setOnline(true);
      this._updateConnectionStatus(true);
    });
    window.addEventListener('offline', () => {
      this.gps.setOnline(false);
      this._updateConnectionStatus(false);
    });
  }

  /**
   * Update the online/offline status indicator.
   * @param {boolean} isOnline
   */
  _updateConnectionStatus(isOnline) {
    const el = document.getElementById('connectionStatus');
    if (isOnline) {
      el.textContent = 'ONLINE';
      el.className = 'offline-indicator online';
    } else {
      el.textContent = 'OFFLINE';
      el.className = 'offline-indicator';
    }
  }

  /**
   * Handle delegated clicks inside the location display modal.
   * @param {MouseEvent} e
   */
  _handleLocationModalClick(e) {
    if (e.target.classList.contains('copy-btn')) {
      const targetId = e.target.dataset.copyTarget;
      this._copyLink(targetId);
      return;
    }
    const action = e.target.dataset.action;
    if (action === 'screenshot') this.takeScreenshot();
    else if (action === 'shareLocation') this.shareLocation();
    else if (action === 'copyAll') this.copyAllLinks();
  }

  /**
   * Handle delegated clicks inside the points list.
   * @param {MouseEvent} e
   */
  _handlePointsListClick(e) {
    const action = e.target.dataset.action;
    if (action === 'show-on-map') {
      this.map.showPointOnMap(
        parseFloat(e.target.dataset.lat),
        parseFloat(e.target.dataset.lng)
      );
    } else if (action === 'delete-point') {
      this.deletePointById(parseInt(e.target.dataset.id, 10));
    }
  }

  /** Load and render the saved waypoints list. */
  async loadPoints() {
    try {
      const points = await this.db.getAllPoints();
      const listEl = document.getElementById("pointsList");
      const countEl = document.getElementById("pointsCount");

      countEl.innerText = points.length;

      if (points.length === 0) {
        listEl.innerHTML = '<li style="text-align: center; color: #555; border-color: #555;">&gt; NO WAYPOINTS IN DATABASE</li>';
        this.map.clearMapMarkers();
        return;
      }

      listEl.innerHTML = points.map(point => {
        let distanceHtml = '';
        if (this.gps.currentUserPosition) {
          const distance = calculateDistance(
            this.gps.currentUserPosition.lat, this.gps.currentUserPosition.lng,
            point.latitude, point.longitude
          );
          distanceHtml = `<br><span class="distance-info">&gt; DISTANCE: ${formatDistance(distance)}</span>`;
        }
        return `
          <li>
            <strong>&gt; ${escapeHtml(point.name)}</strong><br>
            &gt; COORDS: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}<br>
            ${point.altitude ? `&gt; ALT: ${point.altitude.toFixed(1)}m<br>` : ""}
            &gt; ACC: ${point.accuracy.toFixed(1)}m<br>
            ${point.speed !== null ? `&gt; SPEED: ${(point.speed * 3.6).toFixed(1)} km/h<br>` : ""}
            &gt; TIME: ${new Date(point.timestamp).toLocaleString("ru-RU")}
            ${distanceHtml}
            <div class="actions">
              <button class="success" data-action="show-on-map"
                      data-lat="${point.latitude}" data-lng="${point.longitude}">
                [SHOW ON MAP]
              </button>
              <button class="danger" data-action="delete-point" data-id="${point.id}">
                [DELETE]
              </button>
            </div>
          </li>
        `;
      }).join("");

      this.map.updateMapMarkers(points);
    } catch (error) {
      console.error("ERROR LOADING WAYPOINTS:", error);
      alert("> ERROR: WAYPOINT LOAD FAILED");
    }
  }

  /**
   * Delete a waypoint by ID (with confirmation).
   * @param {number} id
   */
  async deletePointById(id) {
    if (confirm("> DELETE THIS WAYPOINT?")) {
      try {
        await this.db.deletePoint(id);
        this.loadPoints();
      } catch (error) {
        alert("> ERROR: WAYPOINT DELETION FAILED");
      }
    }
  }

  /** Clear all waypoints (with confirmation). */
  async clearAllPoints() {
    if (confirm("> WARNING: DELETE ALL WAYPOINTS?\n> THIS ACTION CANNOT BE UNDONE!")) {
      try {
        await this.db.clearPoints();
        this.loadPoints();
        const outputEl = document.getElementById("output");
        outputEl.className = "success";
        outputEl.innerHTML = "&gt; ALL WAYPOINTS DELETED";
      } catch (error) {
        alert("> ERROR: DATABASE CLEAR FAILED");
      }
    }
  }

  /** Export all waypoints to a GPX file. */
  async exportPoints() {
    try {
      const points = await this.db.getAllPoints();
      if (points.length === 0) {
        alert("> ERROR: NO WAYPOINTS TO EXPORT");
        return;
      }

      let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS Navigator AI Edition v3.0" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>GPS Waypoints Export (AI Enhanced)</name>
    <time>${new Date().toISOString()}</time>
    <desc>Exported from GPS-Navigator v3.0 with Neural Network</desc>
  </metadata>
`;
      points.forEach(point => {
        gpx += `  <wpt lat="${point.latitude}" lon="${point.longitude}">
    <name>${escapeHtml(point.name)}</name>
    <time>${point.timestamp}</time>
    ${point.altitude ? `<ele>${point.altitude}</ele>\n` : ''}    <desc>Accuracy: ${point.accuracy.toFixed(1)}m (AI Smoothed)</desc>
  </wpt>
`;
      });
      gpx += `</gpx>`;

      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gps-waypoints-ai-${new Date().toISOString().split('T')[0]}.gpx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert(`> SUCCESS: EXPORTED ${points.length} WAYPOINTS TO GPX FORMAT`);
    } catch (error) {
      alert("> ERROR: EXPORT FAILED - " + escapeHtml(error.toString()));
    }
  }

  /** Update AI status indicators in the UI. */
  updateAIStatus() {
    const statusEl = document.getElementById('aiTrainingStatus');
    const aiStatusEl = document.getElementById('aiStatus');

    if (!this.nn) {
      statusEl.textContent = 'Not initialized';
      aiStatusEl.textContent = 'OFFLINE';
      return;
    }

    const trainingCount = this.nn.trainingCount;

    if (trainingCount === 0) {
      statusEl.textContent = 'Waiting for GPS data...';
      aiStatusEl.innerHTML = 'READY <span class="neural-training-indicator">UNTRAINED</span>';
    } else if (trainingCount < 10) {
      statusEl.textContent = `Learning... (${trainingCount}/10 samples)`;
      aiStatusEl.innerHTML = 'LEARNING <span class="neural-training-indicator">TRAINING</span>';
    } else {
      statusEl.textContent = `Active (${trainingCount} samples trained)`;
      aiStatusEl.innerHTML = 'ACTIVE <span class="neural-training-indicator">TRAINED</span>';
      document.getElementById('aiOutput').innerHTML = this._getAIRecommendations();
    }
  }

  /** @private */
  _predictGPSQuality() {
    if (!this.nn || this.nn.trainingCount < 10) return null;

    const now = new Date();
    const lat = this.gps.currentUserPosition ? this.gps.currentUserPosition.lat : 0;
    const lng = this.gps.currentUserPosition ? this.gps.currentUserPosition.lng : 0;
    const lastAccuracy = this.gps.currentLocationData ? this.gps.currentLocationData.acc : 50;
    const lastSpeed = this.gps.currentLocationData ? (this.gps.currentLocationData.speed || 0) : 0;

    const inputs = normalizeInput(now.getHours(), now.getDay(), lat, lng, lastAccuracy, lastSpeed);
    const predictions = this.nn.predict(inputs);

    return {
      predictedAccuracy: predictions[0] * 100,
      shouldUpdate: predictions[1] > 0.5,
      energyMode: predictions[2] > 0.5 ? 'high' : 'low'
    };
  }

  /** @private */
  _getAIRecommendations() {
    const prediction = this._predictGPSQuality();
    if (!prediction) {
      return "&gt; Collecting data for AI predictions<span class='loading'></span>";
    }
    let html = `
      <strong>&gt; AI PREDICTIONS:</strong><br>
      &gt; Expected GPS Accuracy: ±${prediction.predictedAccuracy.toFixed(1)}m<br>
      &gt; Recommended Update: ${prediction.shouldUpdate ? 'YES' : 'NO'}<br>
      &gt; Energy Mode: ${prediction.energyMode.toUpperCase()}<br>
    `;
    if (prediction.predictedAccuracy < 20) {
      html += `<br><span style="color: var(--terminal-green);">&gt; 🎯 EXCELLENT conditions for GPS fix!</span>`;
    } else if (prediction.predictedAccuracy > 60) {
      html += `<br><span style="color: var(--terminal-amber);">&gt; ⚠️ Poor conditions expected. Try later or move to open area.</span>`;
    }
    return html;
  }

  /** Show AI statistics in an alert dialog. */
  async showAIStats() {
    const data = await this.db.getAITrainingData();
    if (data.length === 0) {
      alert('> NO AI DATA COLLECTED YET');
      return;
    }
    const avgAccuracy = data.reduce((sum, item) => sum + (item.accuracy || 0), 0) / data.length;
    const bestAccuracy = Math.min(...data.map(item => item.accuracy || 999));
    const worstAccuracy = Math.max(...data.map(item => item.accuracy || 0));
    alert(`> AI STATISTICS:\n\nTotal Samples: ${data.length}\nAverage Accuracy: ${avgAccuracy.toFixed(1)}m\nBest Accuracy: ${bestAccuracy.toFixed(1)}m\nWorst Accuracy: ${worstAccuracy.toFixed(1)}m\nNeural Network Training Count: ${this.nn.trainingCount}`);
  }

  /** Retrain the neural network on all stored samples. */
  async trainNeuralNetwork() {
    const data = await this.db.getAITrainingData();
    if (data.length < 5) {
      alert('> NOT ENOUGH DATA FOR TRAINING\n> Collect at least 5 GPS samples');
      return;
    }
    let trained = 0;
    data.forEach(item => {
      if (item.latitude && item.accuracy) {
        const inputs = normalizeInput(
          item.hour, item.dayOfWeek, item.latitude, item.longitude, item.accuracy, item.speed
        );
        const targets = [
          Math.min(item.accuracy / 100, 1),
          item.accuracy < 30 ? 1 : 0,
          item.accuracy > 50 ? 0 : 1
        ];
        this.nn.train(inputs, targets);
        trained++;
      }
    });
    await this.db.saveNeuralNetwork(this.nn.save());
    this.updateAIStatus();
    alert(`> NEURAL NETWORK TRAINED\n> Processed ${trained} data samples`);
  }

  /** Clear all AI data and reinitialise the neural network weights. */
  async resetAI() {
    if (!confirm('> WARNING: RESET ALL AI DATA?\n> This will delete neural network training')) return;
    try {
      await this.db.clearAIData();
      this.nn.reset();
      this.updateAIStatus();
      alert('> AI DATA RESET COMPLETE');
    } catch (error) {
      alert('> ERROR RESETTING AI DATA');
    }
  }

  /** Close the location modal. */
  closeLocationModal() {
    document.getElementById('locationModal').classList.remove('active');
  }

  /** Capture a screenshot of the location display. */
  async takeScreenshot() {
    const locationDisplay = document.getElementById('locationDisplayContent');
    if (!locationDisplay || !locationDisplay.innerHTML) {
      alert('> ERROR: NO LOCATION DATA TO CAPTURE');
      return;
    }
    try {
      const canvas = await window.html2canvas(locationDisplay, {
        backgroundColor: '#000000',
        scale: 2,
        logging: false
      });
      canvas.toBlob(blob => {
        this.screenshotBlob = blob;
        const url = URL.createObjectURL(blob);
        document.getElementById('screenshotImage').src = url;
        document.getElementById('screenshotModal').classList.add('active');
      });
    } catch (error) {
      console.error('Screenshot error:', error);
      alert('> ERROR: SCREENSHOT CAPTURE FAILED');
    }
  }

  /** Close the screenshot modal. */
  closeScreenshotModal() {
    document.getElementById('screenshotModal').classList.remove('active');
  }

  /** Download the captured screenshot. */
  downloadScreenshot() {
    if (!this.screenshotBlob) return;
    const url = URL.createObjectURL(this.screenshotBlob);
    const a = document.createElement('a');
    a.href = url;
    const cityEl = document.getElementById('displayCity');
    const cityName = cityEl ? cityEl.textContent.replace(/[^a-zA-Z0-9]/g, '-') : 'location';
    a.download = `gps-location-${cityName}-${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('> SCREENSHOT SAVED SUCCESSFULLY');
  }

  /** Share the screenshot via Web Share API or fallback. */
  async shareScreenshot() {
    if (!this.screenshotBlob || !this.gps.currentLocationData) return;
    const links = generateMapLinks(this.gps.currentLocationData.lat, this.gps.currentLocationData.lng);
    const cityEl = document.getElementById('displayCity');
    const cityName = cityEl ? cityEl.textContent : 'Unknown';
    const text = `📍 Я сейчас здесь 📍\n\n${cityName}\nGPS: ${this.gps.currentLocationData.lat.toFixed(6)}, ${this.gps.currentLocationData.lng.toFixed(6)}\n\nGoogle Maps: ${links.google}`;
    const file = new File([this.screenshotBlob], 'gps-location.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: `📍 Я сейчас здесь - ${cityName}`, text, files: [file] });
        alert('> SHARED SUCCESSFULLY');
      } catch (error) {
        if (error.name !== 'AbortError') this._fallbackShare();
      }
    } else {
      this._fallbackShare();
    }
  }

  /** Share the current location via Web Share API or copy to clipboard. */
  async shareLocation() {
    if (!this.gps.currentLocationData) return;
    const links = generateMapLinks(this.gps.currentLocationData.lat, this.gps.currentLocationData.lng);
    const cityEl = document.getElementById('displayCity');
    const addressEl = document.getElementById('displayAddress');
    const cityName = cityEl ? cityEl.textContent : 'Unknown';
    const address = addressEl ? addressEl.textContent : '';
    const text = `📍 Я сейчас здесь 📍\n\nМестоположение: ${cityName}\nGPS: ${this.gps.currentLocationData.lat.toFixed(6)}, ${this.gps.currentLocationData.lng.toFixed(6)}\nАдрес: ${address}\n\nGoogle Maps: ${links.google}\nYandex Maps: ${links.yandex}\nOpenStreetMap: ${links.osm}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `📍 Я сейчас здесь - ${cityName}`, text });
        alert('> SHARED SUCCESSFULLY');
      } catch (error) {
        if (error.name !== 'AbortError') this.copyAllLinks();
      }
    } else {
      this.copyAllLinks();
    }
  }

  /** Copy all location data to the clipboard. */
  async copyAllLinks() {
    if (!this.gps.currentLocationData) return;
    const links = generateMapLinks(this.gps.currentLocationData.lat, this.gps.currentLocationData.lng);
    const cityEl = document.getElementById('displayCity');
    const addressEl = document.getElementById('displayAddress');
    const timeEl = document.getElementById('displayTime');
    const cityName = cityEl ? cityEl.textContent : 'Unknown';
    const address = addressEl ? addressEl.textContent : '';
    const timestamp = timeEl ? timeEl.textContent : '';
    const text = `📍 Я СЕЙЧАС ЗДЕСЬ 📍\n\nМестоположение: ${cityName}\n\nGPS-координаты:\nШирота: ${this.gps.currentLocationData.lat.toFixed(6)}\nДолгота: ${this.gps.currentLocationData.lng.toFixed(6)}\nВысота: ${this.gps.currentLocationData.alt ? this.gps.currentLocationData.alt.toFixed(1) + 'm' : 'N/A'}\nТочность: ${this.gps.currentLocationData.acc.toFixed(1)}m\nВремя: ${timestamp}\n\nАдрес: ${address}\n\nСсылки на карты:\nGoogle Maps: ${links.google}\nYandex Maps: ${links.yandex}\nOpenStreetMap: ${links.osm}\n2GIS: ${links.twoGis}\nApple Maps: ${links.apple}\nGeo URI: ${links.geo}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      alert('> ALL LOCATION DATA COPIED TO CLIPBOARD');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('> ALL LOCATION DATA COPIED TO CLIPBOARD');
    }
  }

  /** @private */
  async _copyLink(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const link = element.href;
    try {
      await navigator.clipboard.writeText(link);
      alert('> LINK COPIED TO CLIPBOARD');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('> LINK COPIED TO CLIPBOARD');
    }
  }

  /** @private */
  _fallbackShare() {
    alert('> SHARE NOT SUPPORTED\n> USE DOWNLOAD BUTTON OR COPY ALL DATA');
  }

  /**
   * Get current position and show it on the map.
   * Called by the [MY LOCATION] button in the map section.
   * @private
   */
  _getCurrentLocationOnMap() {
    if (!navigator.geolocation) {
      alert("> ERROR: GEOLOCATION NOT SUPPORTED");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        this.gps.previousPositions.push({ lat: latitude, lng: longitude });
        const smoothed = applySmoothingFilter(latitude, longitude, this.gps.previousPositions);
        this.gps.currentUserPosition = { lat: smoothed.lat, lng: smoothed.lng };
        this.map.updateCurrentLocationMarker(smoothed.lat, smoothed.lng, accuracy);
        this.map.map.setView([smoothed.lat, smoothed.lng], 15);
        this.loadPoints();
        this.updateAIStatus();
      },
      () => alert("> ERROR: LOCATION ACQUISITION FAILED"),
      { enableHighAccuracy: true, timeout: CONFIG.GPS_TIMEOUT, maximumAge: 0 }
    );
  }
}
