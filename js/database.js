import { CONFIG } from './config.js';

/**
 * IndexedDB wrapper for GPS Navigator.
 * Manages three object stores: gpsPoints, geocodeCache, aiTrainingData.
 */
export class Database {
  constructor() {
    /** @type {IDBDatabase|null} */
    this.db = null;
  }

  /**
   * Open and upgrade the IndexedDB database.
   * @returns {Promise<void>}
   */
  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.DB_NAME, 3);

      request.onerror = () => reject("ERROR: DATABASE INITIALIZATION FAILED");

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        this.db = event.target.result;

        if (!this.db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
          const objectStore = this.db.createObjectStore(CONFIG.STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          objectStore.createIndex("timestamp", "timestamp", { unique: false });
          objectStore.createIndex("name", "name", { unique: false });
        }

        if (!this.db.objectStoreNames.contains(CONFIG.GEOCODE_CACHE_STORE)) {
          const cacheStore = this.db.createObjectStore(CONFIG.GEOCODE_CACHE_STORE, {
            keyPath: "key"
          });
          cacheStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        if (!this.db.objectStoreNames.contains(CONFIG.AI_DATA_STORE)) {
          const aiStore = this.db.createObjectStore(CONFIG.AI_DATA_STORE, {
            keyPath: "key",
            autoIncrement: true
          });
          aiStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }

  /**
   * Save a GPS waypoint.
   * @param {Object} point
   * @returns {Promise<number>} The new record ID.
   */
  savePoint(point) {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject("DATABASE NOT INITIALIZED"); return; }
      const tx = this.db.transaction([CONFIG.STORE_NAME], "readwrite");
      const store = tx.objectStore(CONFIG.STORE_NAME);
      const req = store.add(point);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject("ERROR: WAYPOINT SAVE FAILED");
    });
  }

  /**
   * Retrieve all saved GPS waypoints.
   * @returns {Promise<Object[]>}
   */
  getAllPoints() {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject("DATABASE NOT INITIALIZED"); return; }
      const tx = this.db.transaction([CONFIG.STORE_NAME], "readonly");
      const store = tx.objectStore(CONFIG.STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject("ERROR: WAYPOINT RETRIEVAL FAILED");
    });
  }

  /**
   * Delete a waypoint by ID.
   * @param {number} id
   * @returns {Promise<void>}
   */
  deletePoint(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject("DATABASE NOT INITIALIZED"); return; }
      const tx = this.db.transaction([CONFIG.STORE_NAME], "readwrite");
      const store = tx.objectStore(CONFIG.STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject("ERROR: WAYPOINT DELETION FAILED");
    });
  }

  /**
   * Delete all waypoints.
   * @returns {Promise<void>}
   */
  clearPoints() {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject("DATABASE NOT INITIALIZED"); return; }
      const tx = this.db.transaction([CONFIG.STORE_NAME], "readwrite");
      const store = tx.objectStore(CONFIG.STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject("ERROR: DATABASE CLEAR FAILED");
    });
  }

  /**
   * Retrieve a cached geocode result if not expired.
   * @param {string} key
   * @returns {Promise<Object|null>}
   */
  getCachedGeocode(key) {
    return new Promise((resolve) => {
      if (!this.db) { resolve(null); return; }
      try {
        const tx = this.db.transaction([CONFIG.GEOCODE_CACHE_STORE], "readonly");
        const store = tx.objectStore(CONFIG.GEOCODE_CACHE_STORE);
        const req = store.get(key);
        req.onsuccess = () => {
          const result = req.result;
          if (result && (Date.now() - result.timestamp < CONFIG.CACHE_EXPIRY)) {
            resolve(result.data);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Store a geocode result in the cache.
   * @param {string} key
   * @param {Object} data
   */
  async cacheGeocode(key, data) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction([CONFIG.GEOCODE_CACHE_STORE], "readwrite");
      const store = tx.objectStore(CONFIG.GEOCODE_CACHE_STORE);
      store.put({ key, data, timestamp: Date.now() });
    } catch (e) {
      console.error('Cache write error:', e);
    }
  }

  /**
   * Save an AI training data record.
   * @param {Object} data
   */
  async saveAITrainingData(data) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction([CONFIG.AI_DATA_STORE], "readwrite");
      const store = tx.objectStore(CONFIG.AI_DATA_STORE);
      store.add({ ...data, timestamp: Date.now() });
    } catch (e) {
      console.error('Error saving AI training data:', e);
    }
  }

  /**
   * Retrieve all AI training data records (excludes the saved network record).
   * @returns {Promise<Object[]>}
   */
  getAITrainingData() {
    return new Promise((resolve) => {
      if (!this.db) { resolve([]); return; }
      try {
        const tx = this.db.transaction([CONFIG.AI_DATA_STORE], "readonly");
        const store = tx.objectStore(CONFIG.AI_DATA_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          resolve(req.result.filter(item => item.key !== "neuralNetwork"));
        };
        req.onerror = () => resolve([]);
      } catch (e) {
        console.error('Error getting AI training data:', e);
        resolve([]);
      }
    });
  }

  /**
   * Load the persisted neural network weights.
   * @returns {Promise<Object|null>}
   */
  loadNeuralNetwork() {
    return new Promise((resolve) => {
      if (!this.db) { resolve(null); return; }
      try {
        const tx = this.db.transaction([CONFIG.AI_DATA_STORE], "readonly");
        const store = tx.objectStore(CONFIG.AI_DATA_STORE);
        const req = store.get("neuralNetwork");
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Persist neural network weights.
   * @param {Object} data Serialized network state.
   */
  async saveNeuralNetwork(data) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction([CONFIG.AI_DATA_STORE], "readwrite");
      const store = tx.objectStore(CONFIG.AI_DATA_STORE);
      store.put({ key: "neuralNetwork", data, timestamp: Date.now() });
    } catch (e) {
      console.error('Error saving neural network:', e);
    }
  }

  /**
   * Clear all AI training data and the saved network.
   * @returns {Promise<void>}
   */
  clearAIData() {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject("DATABASE NOT INITIALIZED"); return; }
      const tx = this.db.transaction([CONFIG.AI_DATA_STORE], "readwrite");
      const store = tx.objectStore(CONFIG.AI_DATA_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject("ERROR: AI DATA CLEAR FAILED");
    });
  }

  /** Close the database connection. */
  close() {
    if (this.db) this.db.close();
  }
}
