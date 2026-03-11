/** @type {Object} Application configuration constants */
export const CONFIG = {
  DB_NAME: "GPSNavigatorDB",
  STORE_NAME: "gpsPoints",
  GEOCODE_CACHE_STORE: "geocodeCache",
  AI_DATA_STORE: "aiTrainingData",
  GPS_TIMEOUT: 60000, // Increased from 30000 to 60000ms (60 seconds) for indoor GPS
  TRACKING_TIMEOUT: 15000,
  MAP_UPDATE_DEBOUNCE: 1000,
  GEOCODE_TIMEOUT: 5000,
  CACHE_EXPIRY: 7 * 24 * 60 * 60 * 1000,
  MAP_TYPES: [
    {
      name: "OpenStreetMap",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; OpenStreetMap contributors'
    },
    {
      name: "OpenTopoMap",
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: 'Map: OpenTopoMap'
    },
    {
      name: "Satellite (Esri)",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: 'Tiles &copy; Esri'
    }
  ]
};
