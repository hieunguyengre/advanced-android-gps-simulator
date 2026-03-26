# Advanced Android GPS Simulator 🛰️🏃‍♂️

A professional-grade, web-based GPS simulation tool for Android Emulators. This tool bypasses simple straight-line mock locations by generating highly realistic, human-like movement data that mimics actual physical activities (walking, jogging, running, and cycling).

Perfect for testing fitness apps (Strava, Nike Run Club, etc.), location-based games, and navigation apps without leaving your desk.

## ✨ Key Features

- **Realistic Movement Engine**: It doesn't just move in a straight line. It simulates natural pace drift (±5-10%), stride micro-fluctuations, and warm-up/cool-down periods.
- **Auto-Routing**: Click on the map to set waypoints. The engine automatically snaps the route to real road networks and paths using Open Source Routing Machine (OSRM).
- **Activity Profiles**: One-click presets for **Walk**, **Jog**, **Run**, and **Bike**. Automatically configures realistic speeds, GPS noise, and resting behaviors.
- **GPX Import**: Import your own `.gpx` tracks (supports `trkpt`, `rtept`, `wpt`). The simulator will extract elevation data and follow your exact path, even off-road.
- **Altitude Simulation**: Automatically fetches real-world elevation data from Open-Meteo. Speed dynamically adjusts based on the gradient (slower uphill, faster downhill).
- **GPS Jitter & Signal Quality**: Simulates real-world urban noise and stationary drift. When paused, the GPS signal will naturally drift around a 3-5 meter radius.
- **Auto-Pause System**: Intelligently pauses at sharp intersections (>60° turns) and simulates distance-based rest stops (e.g., resting for 30s every 5km).
- **Multi-Lap Looping**: Want to run around a park 10 times? Enable Loop Mode. Every lap is randomized slightly so it never looks like a bot repeating the exact same coordinates.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.
- Android Studio with an AVD (Android Virtual Device) running.
  - *Important: Select an AVD with the Google Play Store icon so you can install apps like Strava or Google Maps.*

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/android-gps-simulator.git
   cd android-gps-simulator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start your Android Emulator. You can do this via Android Studio Device Manager, or via command line to save RAM:
   ```bash
   emulator -avd Pixel_7_API_34  # Replace with your AVD name
   ```

4. Start the simulator server:
   ```bash
   npm run dev
   # Or directly: node server.js
   ```

5. Open your browser and navigate to:
   `http://localhost:3001`

### Connecting to Emulator

1. In the web UI, look at the top-left panel: **Emulator Connection**.
2. The default Host is `localhost` and Port is `5554` (the standard telnet port for the first running emulator).
3. Click **Connect**. 

## 📖 How to Use

### Mode 1: Point-to-Point Routing
1. In the Route Simulation panel, select **Point** or **Route**.
2. Click anywhere on the map to set your starting point.
3. Click elsewhere to add more waypoints. If **Route** is selected, it will auto-calculate real roads between your points.
4. Select an **Activity Profile** (Walk, Jog, Run, Bike) or adjust the target speed manually.
5. Click **Start ▶️**.

### Mode 2: GPX Import
1. In the Route Simulation panel, click the **GPX** button.
2. Select a `.gpx` file from your computer (you can create these on [gpx.studio](https://gpx.studio/)).
3. The route will be drawn in orange. The map will auto-fit to the route bounds.
4. Select an Activity Profile and click **Start ▶️**.

### Advanced Settings (The Secret Sauce)
Click the `v ADVANCED SETTINGS` dropdown to fine-tune the human-like behaviors:
- **Warm-up / Cool-down**: Set how long the simulation takes to reach target speed, or taper off at the end.
- **Pace Variation**: How much the speed drifts naturally over time.
- **Gradient Effect**: How harshly uphill climbs reduce speed.
- **Turn Slowdown**: How much the speed drops when taking sharp corners.
- **Pause Behavior**: Configure the probability of stopping at intersections, and how often a "rest interval" occurs.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, `ws` (WebSockets), `net` (Telnet).
- **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Glassmorphism UI).
- **Map & Routing**: [Leaflet.js](https://leafletjs.com/), [OSRM](http://project-osrm.org/).
- **Elevation**: [Open-Meteo API](https://open-meteo.com/).

## ⚠️ Disclaimer
This tool is built for testing and development purposes. Please do not use this tool to violate the Terms of Service of location-based games or fitness applications.

## License
MIT License
