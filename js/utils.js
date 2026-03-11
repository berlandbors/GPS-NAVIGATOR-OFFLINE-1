import { CONFIG } from './config.js';

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create a debounced version of a function.
 * @param {Function} func
 * @param {number} wait Milliseconds to delay.
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Haversine distance between two coordinates (metres).
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format a distance in metres as a human-readable string.
 * @param {number} meters
 * @returns {string}
 */
export function formatDistance(meters) {
  return meters < 1000
    ? `${meters.toFixed(0)}m`
    : `${(meters / 1000).toFixed(2)}km`;
}

/**
 * Validate a waypoint name.
 * @param {string} name
 * @returns {boolean}
 */
export function validatePointName(name) {
  if (!name) return true;

  // Length check
  if (name.length > 100) return false;

  // Trim check
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;

  // Disallow potential XSS patterns
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=\s*['"]?/i,
    /<\s*iframe/i,
    /<\s*object/i,
    /<\s*embed/i,
  ];

  return !dangerousPatterns.some(pattern => pattern.test(name));
}

/**
 * Generate a cache key for a lat/lng pair.
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
export function generateGeocodeKey(lat, lng) {
  return `${lat.toFixed(4)}_${lng.toFixed(4)}`;
}

/**
 * Classify GPS accuracy.
 * @param {number} accuracy
 * @returns {{ class: string, text: string }}
 */
export function assessGPSQuality(accuracy) {
  if (accuracy <= 10) {
    return {
      class: 'excellent',
      text: `EXCELLENT (±${accuracy.toFixed(1)}m)`
    };
  }
  if (accuracy <= 20) {
    return {
      class: 'good',
      text: `GOOD (±${accuracy.toFixed(1)}m)`
    };
  }
  if (accuracy <= 50) {
    return {
      class: 'fair',
      text: `FAIR (±${accuracy.toFixed(1)}m)`
    };
  }
  return {
    class: 'poor',
    text: `POOR (±${accuracy.toFixed(1)}m)`
  };
}

/**
 * Extract the most specific place name from Nominatim address data.
 * @param {Object} addressData
 * @returns {string}
 */
export function extractCityName(addressData) {
  if (!addressData || !addressData.address) return 'Unknown Location';
  const addr = addressData.address;
  return addr.city || addr.town || addr.village ||
    addr.municipality || addr.county || addr.state ||
    addr.country || 'Unknown Location';
}

/**
 * Generate map links for a coordinate pair.
 * @param {number} lat
 * @param {number} lng
 * @returns {Object}
 */
export function generateMapLinks(lat, lng) {
  return {
    google: `https://www.google.com/maps?q=${lat},${lng}`,
    yandex: `https://yandex.ru/maps/?pt=${lng},${lat}&z=18&l=map`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=18`,
    twoGis: `https://2gis.ru/?m=${lng},${lat}/18`,
    apple: `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`,
    geo: `geo:${lat},${lng}`
  };
}

// Rate-limiting state for Nominatim API (1 request per second max)
let lastGeocodeTime = 0;
const GEOCODE_MIN_INTERVAL = 1000;

/**
 * Reverse-geocode a coordinate, using the DB cache when available.
 * @param {number} lat
 * @param {number} lng
 * @param {import('./database.js').Database} db
 * @param {boolean} isOnline
 * @returns {Promise<{fullAddress: string, cityName: string, addressData: Object|null, fromCache: boolean}>}
 */
export async function reverseGeocode(lat, lng, db, isOnline) {
  const key = generateGeocodeKey(lat, lng);
  const cached = await db.getCachedGeocode(key);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  if (!isOnline) {
    return {
      fullAddress: `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)} (Offline - No address data)`,
      cityName: `Location (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`,
      addressData: null,
      fromCache: false
    };
  }

  // Rate limiting: ensure at least GEOCODE_MIN_INTERVAL ms between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastGeocodeTime;
  if (timeSinceLastRequest < GEOCODE_MIN_INTERVAL) {
    await new Promise(resolve =>
      setTimeout(resolve, GEOCODE_MIN_INTERVAL - timeSinceLastRequest)
    );
  }

  try {
    lastGeocodeTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.GEOCODE_TIMEOUT);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { 'User-Agent': 'GPS-Navigator-App' },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Geocoding failed');

    const data = await response.json();
    const result = {
      fullAddress: data.display_name || `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      cityName: extractCityName(data),
      addressData: data.address,
      fromCache: false
    };

    await db.cacheGeocode(key, result);
    return result;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return {
      fullAddress: `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)} (Address lookup failed)`,
      cityName: `Location (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`,
      addressData: null,
      fromCache: false
    };
  }
}

/**
 * Weighted-average smoothing filter for GPS positions.
 * @param {number} newLat
 * @param {number} newLng
 * @param {{ lat: number, lng: number }[]} previousPositions
 * @returns {{ lat: number, lng: number }}
 */
export function applySmoothingFilter(newLat, newLng, previousPositions) {
  if (previousPositions.length < 3) return { lat: newLat, lng: newLng };

  const recent = previousPositions.slice(-5);
  let weightSum = 0, latSum = 0, lngSum = 0;
  recent.forEach((pos, i) => {
    const weight = i + 1;
    weightSum += weight;
    latSum += pos.lat * weight;
    lngSum += pos.lng * weight;
  });

  return {
    lat: (latSum / weightSum) * 0.7 + newLat * 0.3,
    lng: (lngSum / weightSum) * 0.7 + newLng * 0.3
  };
}

/**
 * Normalise GPS inputs for the neural network (all values → [0, 1]).
 * @returns {number[]}
 */
export function normalizeInput(hour, dayOfWeek, lat, lng, accuracy, speed) {
  return [
    hour / 24,
    dayOfWeek / 7,
    (lat + 90) / 180,
    (lng + 180) / 360,
    Math.min(accuracy / 100, 1),
    Math.min((speed || 0) / 50, 1)
  ];
}
