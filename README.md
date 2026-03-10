# 🛰️ GPS-NAVIGATOR v3.0 AI ENHANCED

> Offline GPS Navigator with Neural Network AI - Progressive Web Application

[![PWA](https://img.shields.io/badge/PWA-Installable-success)](https://berlandbors.github.io/GPS-NAVIGATOR-OFFLINE-1/)
[![AI](https://img.shields.io/badge/AI-Neural%20Network-purple)](https://github.com/berlandbors/GPS-NAVIGATOR-OFFLINE-1)
[![Offline](https://img.shields.io/badge/Offline-Ready-blue)](https://github.com/berlandbors/GPS-NAVIGATOR-OFFLINE-1)

---

## ✨ Features

- 🧠 **Neural Network AI** - Learn GPS patterns and predict accuracy
- 📍 **Offline GPS Tracking** - Works without internet connection
- 🗺️ **Multiple Map Types** - OpenStreetMap, OpenTopoMap, Satellite
- 💾 **IndexedDB Storage** - Save unlimited waypoints locally
- 🔄 **Real-time Tracking** - Continuous location monitoring
- 📤 **GPX Export** - Export waypoints in GPX format
- 📸 **Screenshot Capture** - Save map views as images
- 🎨 **Retro Terminal UI** - Unique monochrome design
- 📱 **PWA Installable** - Install as native app
- 🔒 **Privacy First** - All data stored locally

---

## 🚀 Quick Start

### Online Demo
Visit: [https://berlandbors.github.io/GPS-NAVIGATOR-OFFLINE-1/](https://berlandbors.github.io/GPS-NAVIGATOR-OFFLINE-1/)

### Install as App
1. Open in Chrome/Edge
2. Click ➕ icon in address bar
3. Select "Install GPS-NAV"

### Manual Installation
```bash
git clone https://github.com/berlandbors/GPS-NAVIGATOR-OFFLINE-1.git
cd GPS-NAVIGATOR-OFFLINE-1
python -m http.server 8000
# Open http://localhost:8000
```

---

## 📂 Project Structure

```
GPS-NAVIGATOR-OFFLINE-1/
├── index.html              # Main application
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── offline.html            # Offline fallback
├── browserconfig.xml       # Microsoft tiles config
├── icons/                  # PWA icons (add your icons here!)
│   ├── icon-72x72.png
│   ├── icon-96x96.png
│   ├── icon-128x128.png
│   ├── icon-144x144.png
│   ├── icon-152x152.png
│   ├── icon-192x192.png
│   ├── icon-384x384.png
│   └── icon-512x512.png
├── css/
│   ├── variables.css       # CSS variables
│   ├── animations.css      # Animations
│   ├── components.css      # Component styles
│   └── main.css            # Main styles
└── js/
    ├── app.js              # Application entry
    ├── config.js           # Configuration
    ├── database.js         # IndexedDB wrapper
    ├── neural-network.js   # AI Neural Network
    ├── gps.js              # GPS manager
    ├── map.js              # Leaflet map manager
    ├── ui.js               # UI manager
    ├── utils.js            # Utilities
    └── sw-register.js      # Service Worker registration
```

---

## 🧠 Neural Network

The AI module learns from your GPS usage patterns:

- **Input Layer (6 neurons)**: Hour, Day of Week, Latitude, Longitude, Accuracy, Speed
- **Hidden Layer (8 neurons)**: Pattern recognition
- **Output Layer (3 neurons)**: Predicted accuracy, Update recommendation, Energy mode

Training happens automatically with each GPS update, and weights are saved to IndexedDB.

---

## 🛠️ Technologies

- **Frontend**: Vanilla JavaScript (ES6 Modules)
- **Maps**: Leaflet.js 1.9.4
- **Storage**: IndexedDB
- **PWA**: Service Workers + Web App Manifest
- **Geocoding**: Nominatim API
- **Screenshots**: HTML2Canvas
- **Styling**: Pure CSS (Terminal theme)

---

## 📱 Browser Support

- ✅ Chrome/Edge 90+ (Full support)
- ✅ Firefox 88+ (Full support)
- ✅ Safari 14+ (Limited PWA features)
- ✅ iOS Safari 14+ (Add to Home Screen)
- ✅ Android Chrome (Installable PWA)

---

## 🎯 TODO / Roadmap

- [ ] Add icons to `/icons/` folder (see [ICON-SETUP.md](ICON-SETUP.md))
- [ ] Route calculation between waypoints
- [ ] Import GPX files
- [ ] Statistics dashboard
- [ ] Dark/Light theme toggle
- [ ] Multi-language support
- [ ] Voice navigation
- [ ] Share waypoints via QR code

---

## 📄 License

MIT License - Feel free to use and modify

---

## 👨‍💻 Author

Created by **berlandbors**

---

## 🙏 Acknowledgments

- [Leaflet.js](https://leafletjs.com/) - Interactive maps
- [OpenStreetMap](https://www.openstreetmap.org/) - Map data
- [Nominatim](https://nominatim.org/) - Geocoding API

---

## ⚠️ IMPORTANT: Icon Setup Required

After pulling these changes, you need to add icon files to the `/icons/` folder.

**See [ICON-SETUP.md](ICON-SETUP.md) for detailed instructions.**

Quick steps:
1. Create `/icons/` folder
2. Generate icons using one of the methods in ICON-SETUP.md
3. Add all required sizes (16x16 to 512x512)
4. Test PWA installation

---

**Ready to install as a PWA after adding icons!** 🚀
