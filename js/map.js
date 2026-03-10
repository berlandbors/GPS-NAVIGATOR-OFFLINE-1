import { CONFIG } from './config.js';
import { escapeHtml } from './utils.js';

/**
 * Manages the Leaflet map, tile layers, and map markers.
 */
export class MapManager {
  constructor() {
    /** @type {L.Map|null} */
    this.map = null;
    /** @type {L.TileLayer|null} */
    this.currentTileLayer = null;
    /** @type {L.Marker[]} */
    this.markers = [];
    /** @type {L.CircleMarker|null} */
    this.currentLocationMarker = null;
    /** @type {L.Circle|null} */
    this.accuracyCircle = null;
    this.currentMapType = 0;
  }

  /** Initialise the Leaflet map centred on Moscow. */
  init() {
    this.map = L.map("map").setView([55.7558, 37.6173], 10);
    const type = CONFIG.MAP_TYPES[this.currentMapType];
    this.currentTileLayer = L.tileLayer(type.url, {
      attribution: type.attribution,
      maxZoom: 19
    }).addTo(this.map);
  }

  /** Cycle through available map tile layers. */
  toggleMapType() {
    if (!this.map) return;
    if (this.currentTileLayer) this.map.removeLayer(this.currentTileLayer);
    this.currentMapType = (this.currentMapType + 1) % CONFIG.MAP_TYPES.length;
    const type = CONFIG.MAP_TYPES[this.currentMapType];
    this.currentTileLayer = L.tileLayer(type.url, {
      attribution: type.attribution,
      maxZoom: 19
    }).addTo(this.map);
    alert(`> MAP TYPE CHANGED TO: ${type.name.toUpperCase()}`);
  }

  /** Remove all waypoint markers from the map. */
  clearMapMarkers() {
    this.markers.forEach(marker => this.map.removeLayer(marker));
    this.markers = [];
  }

  /**
   * Re-draw all waypoint markers.
   * @param {Object[]} points
   */
  updateMapMarkers(points) {
    this.clearMapMarkers();
    points.forEach(point => {
      const marker = L.marker([point.latitude, point.longitude])
        .addTo(this.map)
        .bindPopup(`
          <h3>&gt; ${escapeHtml(point.name)}</h3>
          <p><strong>&gt; COORDINATES:</strong><br>
          ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}</p>
          ${point.altitude ? `<p><strong>&gt; ALTITUDE:</strong> ${point.altitude.toFixed(1)}m</p>` : ""}
          <p><strong>&gt; ACCURACY:</strong> ${point.accuracy.toFixed(1)}m</p>
          <p><strong>&gt; TIMESTAMP:</strong><br>${new Date(point.timestamp).toLocaleString("ru-RU")}</p>
        `);
      this.markers.push(marker);
    });
  }

  /** Fit the map view to all waypoint markers. */
  centerOnPoints() {
    if (this.markers.length === 0) {
      alert("> ERROR: NO WAYPOINTS TO DISPLAY");
      return;
    }
    const group = L.featureGroup(this.markers);
    this.map.fitBounds(group.getBounds().pad(0.1));
  }

  /**
   * Centre the map on a specific point and open its popup.
   * @param {number} lat
   * @param {number} lng
   */
  showPointOnMap(lat, lng) {
    this.map.setView([lat, lng], 15);
    this.markers.forEach(marker => {
      const ll = marker.getLatLng();
      if (Math.abs(ll.lat - lat) < 0.000001 && Math.abs(ll.lng - lng) < 0.000001) {
        marker.openPopup();
      }
    });
  }

  /**
   * Update (or create) the blue "current position" marker.
   * @param {number} lat
   * @param {number} lng
   * @param {number} accuracy
   */
  updateCurrentLocationMarker(lat, lng, accuracy) {
    // Remove old marker
    if (this.currentLocationMarker) this.map.removeLayer(this.currentLocationMarker);

    // Remove old accuracy circle if exists
    if (this.accuracyCircle) this.map.removeLayer(this.accuracyCircle);

    // Create accuracy circle (semi-transparent)
    this.accuracyCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: '#00ffff',
      fillColor: '#00ffff',
      fillOpacity: 0.15,
      weight: 1,
      opacity: 0.5
    }).addTo(this.map);

    // Create native marker with custom blue color
    this.currentLocationMarker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#00ffff',
      color: '#000',
      weight: 2,
      opacity: 1,
      fillOpacity: 1
    })
      .addTo(this.map)
      .bindPopup(`
        <h3>&gt; YOUR POSITION (AI SMOOTHED)</h3>
        <p><strong>&gt; COORDINATES:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
        ${accuracy ? `<p><strong>&gt; ACCURACY:</strong> ${accuracy.toFixed(1)}m</p>` : ""}
        <p><small>&gt; UPDATED: ${new Date().toLocaleTimeString("ru-RU")}</small></p>
      `);
  }
}
