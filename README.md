# Advanced Android GPS Simulator 🛰️🏃‍♂️

A professional-grade, web-based GPS simulation tool for Android Emulators. Generates highly realistic, human-like movement data that mimics actual physical activities — walking, jogging, running, and cycling — complete with natural pace variations, GPS noise, and intelligent rest stops.

Perfect for testing fitness apps (Strava, Nike Run Club, etc.), location-based games, and navigation apps without leaving your desk.

## ✨ Key Features

### 🗺️ Route Creation
- **Click-to-Route**: Click waypoints on the map. Routes auto-snap to real roads and footpaths via [OSRM](http://project-osrm.org/) foot routing.
- **GPX Import**: Import `.gpx` tracks (supports `trkpt`, `rtept`, `wpt`). Follows your exact path with embedded or API-fetched elevation.
- **🎲 Random Run**: Click any point on the map and generate a spontaneous, closed-loop running route around it. Adjust the radius (200–2000m) and target distance (1–10km). Each generation is unique — perfect for simulating impromptu runs.
- **🔍 Search Routes**: Discover real community-mapped hiking, running, and cycling routes from [OpenStreetMap](https://www.openstreetmap.org/) near any location. Browse results, preview on map, and load with one click.

### 🏃 Realistic Movement Engine
- **Natural Speed**: Pace drift (±5–10%), stride micro-fluctuations, warm-up/cool-down phases.
- **Activity Profiles**: One-click presets for **Walk**, **Jog**, **Run**, and **Bike** with tuned speeds, GPS noise, and rest behaviors.
- **Gradient-Aware**: Auto-fetches real-world elevation from [Open-Meteo](https://open-meteo.com/). Speed adjusts on hills — slower uphill, faster downhill.
- **Turn Slowdown**: Speed drops naturally at sharp corners.

### 📡 GPS Simulation
- **GPS Jitter**: Simulates real-world urban multipath noise and signal quality variations.
- **Stationary Drift**: When paused, GPS coordinates drift realistically within a 3–5m radius.
- **Auto-Pause**: Intelligent stops at intersections (>60° turns) and distance-based rest stops.
- **Multi-Lap Loop**: Run around a park 10 times — each lap is slightly randomized so it never looks like a bot.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- Android Studio with an AVD (Android Virtual Device) running
  - *Tip: Select an AVD with the Google Play Store icon to install apps like Strava or Google Maps.*

### Installation

```bash
git clone https://github.com/hieunguyengre/advanced-android-gps-simulator.git
cd advanced-android-gps-simulator
npm install
```

### Running

1. Start your Android Emulator:
   ```bash
   emulator -avd Pixel_7_API_34  # Replace with your AVD name
   ```

2. Start the simulator:
   ```bash
   npm run dev
   # Or: node server.js
   ```

3. Open `http://localhost:3001` in your browser.

4. Click **Connect** in the top-left panel (default: `localhost:5554`).

## 📖 How to Use

### Point / Route Mode
1. Select **Point** (single click) or **Route** (multi-waypoint) mode.
2. Click on the map to place waypoints. Routes auto-snap to roads.
3. Choose an Activity Profile or set target speed manually.
4. Click **Start ▶️**.

### GPX Import
1. Click the **GPX** button in the mode bar.
2. Select a `.gpx` file (create one at [gpx.studio](https://gpx.studio/)).
3. The route appears in orange. Select a profile and click **Start ▶️**.

### 🎲 Random Run
1. Click the **Random** button in the mode bar.
2. Set the **Radius** (area around center) and **Target Distance** (total route length).
3. Click anywhere on the map to set the center point — a target marker and radius circle appear.
4. Click **Generate Route** — a closed-loop route is created on real roads.
5. Click **Generate Route** again for a different random route at the same center.
6. Use the standard Start/Pause/Stop controls to simulate.

### 🔍 Search Routes
1. Click the **Search** button in the mode bar.
2. Set the **Search Radius** (1–20 km).
3. Click on the map — the app searches [OpenStreetMap](https://www.openstreetmap.org/) for community-mapped hiking, running, and cycling routes nearby.
4. Browse the results list — each card shows the route name, type badge, distance, and proximity.
5. Hover a route card to preview it on the map.
6. Click **Use Route** to load it into the simulator.

### Advanced Settings
Expand **Advanced Settings** to fine-tune:
- **Pace Variation** — Natural speed drift intensity
- **Warm-up / Cool-down** — Gradual speed ramp-up and taper
- **Gradient Effect** — Hill impact on speed
- **Turn Slowdown** — Speed reduction at sharp corners
- **Pause Behavior** — Intersection stop probability, rest intervals and durations

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, WebSockets (`ws`), Telnet (`net`) |
| Frontend | HTML5, Vanilla JS, CSS3 (Glassmorphism dark UI) |
| Map | [Leaflet.js](https://leafletjs.com/) + [CARTO](https://carto.com/) dark tiles |
| Routing | [OSRM](http://project-osrm.org/) foot profile |
| Elevation | [Open-Meteo API](https://open-meteo.com/) |

## ⚠️ Disclaimer

This tool is built for **testing and development purposes only**. Do not use it to violate the Terms of Service of location-based games or fitness applications.

## License

MIT License
