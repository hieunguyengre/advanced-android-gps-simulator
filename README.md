# Advanced Android GPS Simulator 🛰️🏃‍♂️

A professional-grade, web-based GPS simulation tool for Android Emulators. Generates highly realistic, human-like movement data that mimics actual physical activities — walking, jogging, running, and cycling — complete with natural pace variations, research-based GPS noise, and intelligent bio-mechanical behaviors.

Perfect for testing fitness apps (Strava, Nike Run Club, etc.), location-based games, and navigation apps without leaving your desk.

## ✨ Key Features

### 🗺️ Route Creation
- **🛣️ Road Snap**: Click waypoints and routes auto-snap to real roads and footpaths via [OSRM](http://project-osrm.org/).
- **🚶 Freeform Walk**: Connect waypoints directly with **Catmull-Rom spline smoothing**. Perfect for simulating paths through parks, fields, or areas not mapped on roads. Curves are organic and non-geometric.
- **📦 GPX Import**: Import `.gpx` tracks. Follows your exact path with embedded or API-fetched elevation.
- **🎲 Random Run**: Generate spontaneous closed-loop routes with one click. Select from 3 organic strategies: **Out-and-back**, **Lollipop/Figure-8**, or **Organic Blob**.
- **🔍 Search Routes**: Discover community-mapped hiking and cycling routes from OpenStreetMap near any location.

### 🏃 Realistic Movement Engine
- **Natural Speed**: Pace drift (±5-10%), stride micro-fluctuations, and warm-up/cool-down phases.
- **Pace Display**: Real-time pace (min/km) and speed (km/h) tracking.
- **Gradient-Aware**: Speed adjusts automatically on hills — slower uphill, faster downhill via [Open-Meteo](https://open-meteo.com/).
- **Turn Slowdown**: Speed drops naturally at sharp corners.
- **⏩ Speed Multiplier**: Simulate long runs in minutes with 2×, 5×, or 10× speed multipliers.

### 📡 High-Fidelity GPS Simulation
- **Research-Based Jitter**: Replaced basic noise with a **Gaussian random walk** model. Choose from 5 presets: **Premium Watch**, **Standard Watch**, **Phone (Good/Urban/Poor)**.
- **Urban Density Scaling**: GPS jitter increases automatically in "urban" areas (detected by turn density).
- **Stationary Drift**: Realistic 3–5m random drift when paused.
- **Auto-Pause**: Intelligent stops at intersections and distance-based rest intervals.
- **💾 GPX Export**: Export your *simulated* path (including jitter and timestamps) back to a `.gpx` file for verification in other apps.

### 🍱 Project Management
- **LocalStorage Sync**: Save and load your favorite routes and advanced settings configurations.
- **⌨️ Keyboard Shortcuts**: Use **Ctrl+Z** to undo the last clicked waypoint.
- **📍 Hanoi Default**: The map initializes at Hanoi, Vietnam for a consistent starting point.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- Android Studio with an AVD (Android Virtual Device) running.

### Installation
```bash
git clone https://github.com/hieunguyengre/advanced-android-gps-simulator.git
cd advanced-android-gps-simulator
npm install
```

### Running
1. Start your Android Emulator.
2. Start the simulator:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3001` in your browser.
4. Click **Connect** (default: `localhost:5554`).

## 📖 How to Use

### Route Mode
1. Select **Route** mode.
2. Choose between **Road Snap** (follows roads) or **Freeform** (smooth curves between points).
3. Click waypoints on the map. Use **Ctrl+Z** to undo mistakes.
4. Choose an **Activity Profile** or set speed manually.
5. Click **Start ▶️**.

### 🎲 Random Run
1. Select **Random** mode.
2. Set Radius and Target Distance.
3. Pick a **Route Shape** strategy (or leave on Random).
4. Klik current location or anywhere on the map to set the center.
5. Click **Generate Route** and then **Start ▶️**.

### Settings Persistence
1. Once you have a route and settings you like, click **Save** in the Route panel.
2. Access your saved routes later via the **Load saved...** dropdown.

## 🛠️ Tech Stack
- **Backend**: Node.js, Express, WebSockets, Telnet.
- **Frontend**: Vanilla JS (ES6+), CSS3 (Glassmorphism), Leaflet.js.
- **Data**: OSRM (Routing), Open-Meteo (Elevation), CARTO (Tiles).

## ⚠️ Disclaimer
This tool is for **testing and development purposes only**. Please respect the Terms of Service of location-based applications.

## License
MIT License
