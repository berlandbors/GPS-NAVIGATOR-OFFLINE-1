/**
 * Smart Map Tile Prefetcher
 * Downloads map tiles for offline use
 */
export class MapTilePrefetcher {
  constructor() {
    this.centerLat = null;
    this.centerLon = null;
    this.zoomLevels = [10, 11, 12, 13]; // 4 zoom levels for good coverage
    this.visitedAreas = new Set();
  }

  /**
   * Download tiles around user's current location
   */
  async prefetchCurrentLocation() {
    console.log('[Prefetcher] Getting your location...');

    try {
      const position = await this.getCurrentPosition();
      this.centerLat = position.coords.latitude;
      this.centerLon = position.coords.longitude;

      console.log(`[Prefetcher] Location: ${this.centerLat.toFixed(4)}, ${this.centerLon.toFixed(4)}`);

      await this.prefetchTiles();
    } catch (error) {
      console.error('[Prefetcher] Location error:', error);
      alert('> Could not get your location. Please enable GPS and try again.');
    }
  }

  /**
   * Download tiles for specific coordinates
   */
  async prefetchArea(lat, lon) {
    this.centerLat = lat;
    this.centerLon = lon;
    console.log(`[Prefetcher] Downloading area: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    await this.prefetchTiles();
  }

  /**
   * Main tile downloading logic
   */
  async prefetchTiles() {
    const tiles = this.generateTileUrls();
    const cache = await caches.open('gps-nav-map-tiles-v2');

    let cached = 0;
    const total = tiles.length;

    this.showProgress(0, total);

    for (const url of tiles) {
      try {
        // Check if already cached
        const existing = await cache.match(url);
        if (existing) {
          cached++;
          continue;
        }

        // Download and cache
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
          cached++;
          this.showProgress(cached, total);
        }
      } catch (err) {
        console.warn('[Prefetcher] Failed to cache:', url);
      }
    }

    console.log(`[Prefetcher] Complete! ${cached}/${total} tiles cached`);
    this.showComplete(cached, total);
  }

  /**
   * Generate tile URLs for the area
   */
  generateTileUrls() {
    const urls = [];

    for (const zoom of this.zoomLevels) {
      const tiles = this.getTilesForZoom(zoom);
      tiles.forEach(({ x, y }) => {
        urls.push(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
      });
    }

    return urls;
  }

  /**
   * Calculate tiles needed for a zoom level
   */
  getTilesForZoom(zoom) {
    const centerTile = this.latLonToTile(this.centerLat, this.centerLon, zoom);
    const tiles = [];

    // Larger radius for lower zoom (wider area)
    const radius = zoom <= 10 ? 2 : (zoom === 11 ? 3 : (zoom === 12 ? 4 : 5));

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        tiles.push({
          x: centerTile.x + dx,
          y: centerTile.y + dy
        });
      }
    }

    return tiles;
  }

  /**
   * Convert lat/lon to tile coordinates
   */
  latLonToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor(
      (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
    );
    return { x, y };
  }

  /**
   * Smart prefetching: cache neighbours when user moves map
   */
  async prefetchNeighbors(lat, lon, zoom) {
    const key = `${lat.toFixed(2)}_${lon.toFixed(2)}_${zoom}`;

    if (this.visitedAreas.has(key)) return;
    this.visitedAreas.add(key);

    const cache = await caches.open('gps-nav-map-tiles-v2');
    const centerTile = this.latLonToTile(lat, lon, zoom);

    // 3x3 grid around current view
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const url = `https://tile.openstreetmap.org/${zoom}/${centerTile.x + dx}/${centerTile.y + dy}.png`;

        try {
          const existing = await cache.match(url);
          if (!existing) {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
            }
          }
        } catch (err) {
          // Silent fail for background caching
        }
      }
    }
  }

  /**
   * Show download progress
   */
  showProgress(cached, total) {
    const percent = Math.round((cached / total) * 100);
    const output = document.getElementById('output');
    if (output) {
      output.innerHTML = `
        <div class="info">
          &gt; DOWNLOADING MAP TILES FOR OFFLINE USE...<br>
          &gt; PROGRESS: ${cached}/${total} (${percent}%)<br>
          &gt; <progress value="${cached}" max="${total}"></progress><br>
          &gt; This area will be available offline!<span class="cursor">█</span>
        </div>
      `;
    }
  }

  /**
   * Show completion message
   */
  showComplete(cached, total) {
    const output = document.getElementById('output');
    if (output) {
      output.innerHTML = `
        <div class="success">
          &gt; SUCCESS: ${cached}/${total} MAP TILES CACHED! 🗺️<br>
          &gt; This area is now available OFFLINE<br>
          &gt; Estimated size: ~${Math.round(cached * 15 / 1024)} MB<br>
          &gt; You can use the app without internet<span class="cursor">█</span>
        </div>
      `;
    }
  }

  /**
   * Get current GPS position
   */
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        position => resolve(position),
        error => reject(error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const cache = await caches.open('gps-nav-map-tiles-v2');
    const keys = await cache.keys();
    const tiles = keys.filter(req => {
      try {
        const hostname = new URL(req.url).hostname;
        return hostname === 'tile.openstreetmap.org' || hostname.endsWith('.tile.openstreetmap.org');
      } catch {
        return false;
      }
    });

    return {
      count: tiles.length,
      sizeMB: Math.round(tiles.length * 15 / 1024) // ~15KB per tile
    };
  }
}
