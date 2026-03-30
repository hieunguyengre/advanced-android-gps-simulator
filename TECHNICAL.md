# Technical Documentation — Advanced Android GPS Simulator

> **Purpose:** This document is the single source of truth for understanding the project's architecture, data flow, algorithms, and conventions. An AI reading this file should be able to make code changes without reading the full source code.

---

## 1. Project Overview

A web-based tool that sends fake GPS coordinates to an Android Emulator via Telnet, simulating realistic human movement (walking, jogging, running, cycling). The user creates routes on a Leaflet map, configures speed/jitter/pauses, and clicks Start. The server interpolates position along the route at 100ms intervals and sends `geo fix` commands to the emulator.

**Stack:** Node.js (server), Vanilla JS (frontend), Express, WebSockets (`ws`), Leaflet.js.
**No framework, no build step.** `npm run dev` starts the server with `--watch`.

---

## 2. File Structure

```
├── server.js              # ALL backend logic (1388 lines)
│   ├── Express REST APIs (route proxy, elevation, random route, search)
│   ├── EmulatorConnection  (Telnet to Android Emulator)
│   ├── NaturalSpeedEngine  (human-like speed variation)
│   ├── GPSJitter           (Gaussian random walk noise)
│   ├── RouteSimulator      (main simulation loop)
│   ├── generateGPXFromTrack (GPX export)
│   └── WebSocket handler   (all WS messages)
│
├── public/
│   ├── index.html          # Single-page HTML (433 lines)
│   ├── index.css           # All styles, dark glassmorphism theme (1188 lines)
│   └── app.js              # ALL frontend logic (1612 lines)
│       ├── State variables & presets (GPS_QUALITY, PROFILES)
│       ├── Map initialization (Leaflet + CARTO dark tiles)
│       ├── 5 interaction modes (click, route, GPX, random, search)
│       ├── Routing modes (road snap via OSRM, freeform via Catmull-Rom)
│       ├── WebSocket message handler
│       ├── Save/Load configurations (localStorage)
│       └── Event bindings
│
├── package.json            # Dependencies: express, ws
└── README.md
```

---

## 3. Architecture & Data Flow

```
┌──────────────────┐     WebSocket      ┌──────────────────┐     Telnet      ┌──────────────┐
│   Browser (UI)   │ ◄═══════════════► │   Node Server    │ ═══════════════► │  Android     │
│   public/app.js  │   JSON messages    │   server.js      │   geo fix cmd   │  Emulator    │
│   Leaflet map    │                    │   RouteSimulator │                  │  port 5554   │
└──────────────────┘                    └──────────────────┘                  └──────────────┘
                                              │
                                              │ HTTP (fetch)
                                              ▼
                                   ┌─────────────────────┐
                                   │ External APIs        │
                                   │ • OSRM (routing)     │
                                   │ • Open-Meteo (elev)  │
                                   │ • Overpass (search)  │
                                   │ • Waymarked Trails   │
                                   └─────────────────────┘
```

### Simulation Loop (server.js → RouteSimulator._step)

Every **100ms real-time** (but scaled by `speedMultiplier`):

1. Check if auto-paused → apply stationary drift, return
2. Check end-of-route → next lap or stop
3. Check auto-pause triggers (intersection angle > 60°, rest distance)
4. Calculate speed via `NaturalSpeedEngine.getSpeed()` (drift + turn + gradient + warm-up/cool-down)
5. Advance position along route segment by `speedMs * deltaMs`
6. Apply `GPSJitter.apply()` (Gaussian random walk + urban density)
7. Send `geo fix` to emulator via Telnet
8. Record track point for GPX export (every ~1s simulated)
9. Broadcast `position-update` to all WebSocket clients

---

## 4. REST API Endpoints (server.js)

| Method | Path | Purpose | External API |
|--------|------|---------|-------------|
| GET | `/api/route?coordinates=lng,lat;lng,lat` | Road routing (OSRM foot profile) | `router.project-osrm.org` |
| GET | `/api/elevation?lats=...&lngs=...` | Elevation lookup (up to 100 points) | `api.open-meteo.com` |
| GET | `/api/random-route?lat=&lng=&radius=&distance=&shape=` | Generate random loop waypoints, route via OSRM | OSRM |
| GET | `/api/search-routes?lat=&lng=&radius=&activity=` | Search community routes | Overpass + Waymarked Trails |

---

## 5. WebSocket Protocol

All messages are JSON `{ type: string, ...payload }`.

### Client → Server

| type | payload | description |
|------|---------|-------------|
| `connect` | `host, port` | Connect to emulator via Telnet |
| `disconnect` | — | Disconnect Telnet |
| `set-location` | `lat, lng, alt?` | Send single GPS point |
| `start-route` | `routePoints, elevations, speed, jitter, jitterIntensity, jitterUrbanMult, loop, laps, autoPause, advanced` | Start route simulation |
| `pause-route` | — | Pause simulation |
| `resume-route` | — | Resume simulation |
| `stop-route` | — | Stop simulation |
| `set-speed` | `speed` (km/h) | Change base speed mid-simulation |
| `set-speed-multiplier` | `multiplier` (1-20) | Change simulation time scaling |
| `export-gpx` | — | Request GPX XML of recorded track |
| `get-status` | — | Query connection + simulator state |

### Server → Client

| type | key fields | description |
|------|-----------|-------------|
| `status` | `connected, authenticated` | Connection state |
| `connect-result` | `success, message` | Connection attempt result |
| `location-set` | `lat, lng` | Confirmed single GPS update |
| `position-update` | `lat, lng, altitude, speed, gradient, distance, totalDistance, progressPct, elapsedMs, speedMultiplier, lap, totalLaps, isAutoPaused, pauseReason, pauseRemaining` | Main simulation tick (10×/sec) |
| `route-started` | — | Simulation began |
| `route-paused` | — | Paused by user |
| `route-resumed` | — | Resumed by user |
| `route-stopped` | — | Stopped by user |
| `route-complete` | `laps` | Route finished all laps |
| `auto-pause-start` | `reason, duration` | Auto-pause triggered (intersection/rest) |
| `auto-pause-end` | — | Auto-pause ended |
| `lap-complete` | `lap, totalLaps` | Lap finished in loop mode |
| `export-gpx-result` | `gpx` (XML string) or `error` | GPX export response |
| `error` | `message` | Error |

---

## 6. Key Classes (server.js)

### EmulatorConnection (line ~520)
Manages Telnet connection to Android Emulator console.
- `connect(host, port)` → auto-reads auth token from `~/.emulator_console_auth_token`
- `setLocation(lat, lng, alt)` → sends `geo fix {lng} {lat} {alt}` (note: OSRM order is lng,lat)
- `disconnect()` → sends `quit`, destroys socket

### NaturalSpeedEngine (line ~606)
Generates human-like speed variations.
- **Pace drift**: Two layered sine waves with random phase/frequency (scaled by `paceVariation`)
- **Micro-fluctuation**: Brownian-motion-style tiny speed changes
- **Warm-up phase**: Smoothstep from 55% → 100% of target speed
- **Cool-down phase**: Smoothstep from 100% → 60% of target speed
- **Turn slowdown**: Speed reduces proportionally to turn angle (max reduction = `turnSlowdownMax`)
- **Gradient effect**: Uphill slows (max -40%), downhill speeds up (max +15%)
- Output: `currentSpeed = baseSpeed × (1 + drifts) × phase × turn × gradient`, clamped at 30% minimum

### GPSJitter (line ~712)
Research-based GPS noise simulation using **Gaussian random walk** (not sinusoidal).
- **Box-Muller transform** for Gaussian random numbers
- **Random walk**: velocity += Gaussian × 0.08, offset += velocity, with damping (0.88) and mean reversion
- **Urban density scaling**: `effectiveIntensity = intensity × (1 + urbanDensity × urbanMultBase)` — more turns in area = worse GPS
- **Stationary drift**: Separate slow random walk when paused (~1-4m cluster)
- **Per-lap seed**: `setLapSeed()` gives each lap a different initial offset so laps don't overlap perfectly
- **Key constants**: noiseScale = `0.000008 × intensity` (~0.9m/unit), maxOffset = `0.000015 × intensity`

### RouteSimulator (line ~855)
Main simulation controller.
- Owns: `routePoints[]`, `elevations[]`, `speedEngine`, `jitter`, `recordedTrack[]`
- **Precomputes**: `turnAngles[]` (angle at each point), `urbanDensity[]` (rolling window of turn density)
- **Auto-pause**: intersection (turn > 60°, probability-based) + distance-based rest stops
- **Loop mode**: resets index at end, changes lap seed, schedules new rest stop
- **Track recording**: captures {lat, lng, alt, time} every ~1s simulated time for GPX export
- **Speed multiplier**: `deltaMs × speedMultiplier` per tick (1×-20×)
- **Update interval**: 100ms real-time setInterval

---

## 7. Key Frontend Systems (public/app.js)

### Interaction Modes
Variable `mode` controls click behavior:
| mode | behavior |
|------|----------|
| `click` | Single GPS point → send to emulator immediately |
| `route` | Add waypoints, build route (road snap or freeform) |
| `random` | Set center + radius, generate random route loop |
| `search` | Set center + radius, search Overpass/Waymarked for community routes |

GPX import is triggered via file input (no dedicated mode).

### Routing Modes (within Route mode)
Variable `routingMode`:
| value | behavior |
|-------|----------|
| `road` | OSRM fetch → road-snapped polyline (green `#34d399`) |
| `freeform` | Direct waypoint connect → Catmull-Rom spline smooth (amber `#f59e0b`) |

**Catmull-Rom spline** (`catmullRomSmooth()`): Extends first/last points as phantom control points, interpolates 20 points per segment using standard Catmull-Rom basis matrix. Produces smooth curves that pass exactly through every waypoint.

### GPS Quality Presets (frontend constants)
| key | name | intensity | urbanMult |
|-----|------|-----------|-----------|
| `premium` | Premium Watch | 0.3 | 0.3 |
| `standard` | Standard Watch | 1.0 | 0.5 |
| `phone_good` | Phone - Good | 1.5 | 0.8 |
| `phone_urban` | Phone - Urban | 2.5 | 1.5 |
| `phone_poor` | Phone - Poor | 4.0 | 2.0 |

These map to `jitterIntensity` and `jitterUrbanMult` sent in `start-route` message.

### Activity Profile Presets
| profile | speed (km/h) | jitter | gpsQuality | autoPause | paceVar | turnSlow |
|---------|-------------|--------|-----------|-----------|---------|----------|
| walking | 5 | ✓ | phone_good | ✓ | 120% | 20% |
| jogging | 8 | ✓ | standard | ✓ | 100% | 35% |
| running | 12 | ✓ | standard | ✗ | 80% | 45% |
| cycling | 22 | ✓ | premium | ✓ | 70% | 50% |

### Save/Load Configurations
- Storage: `localStorage` key `gps_sim_configs`
- Saves: `{ routePoints, elevations, routeDistance, speed, jitter, gpsQuality, loop, laps, autoPause, profile, advanced: {...}, savedAt }`
- Load restores all sliders/toggles, redraws route on map, applies profile

### Keyboard Shortcuts
| key | context | action |
|-----|---------|--------|
| `Ctrl+Z` / `Cmd+Z` | Route mode | Undo last waypoint |

---

## 8. Random Route Generation (server.js)

`generateRandomLoopWaypoints(centerLat, centerLng, radiusMeters, targetDistanceKm, shape)`

Three strategies selected by `shape` parameter:

### `out-and-back` (35% default probability)
Runner goes out, explores an area off to one side, then returns via a slightly different path.
- Picks random outbound direction
- Places waypoints along path with lateral jitter
- Creates a side exploration loop
- Returns via offset path

### `lollipop` (25%)
Run to a destination, make a loop, come back.
- Straight outbound leg to a circle center
- Small circular loop at far end
- Return via similar path

### `organic` (40%)
Irregular-shaped loop using layered sine waves (Perlin-like noise).
- Multiple sine layers with random amplitude/frequency/phase
- Creates non-circular, non-symmetric loop that looks like a real running track
- Always returns to start point

After waypoint generation, all strategies are routed through **OSRM foot profile** to snap to real roads. On OSRM failure, retries with fewer waypoints.

---

## 9. Search Routes (server.js)

`GET /api/search-routes?lat=&lng=&radius=&activity=`

Two parallel data sources:

### Overpass API (`fetchOverpassRoutes`)
- Queries route relations (foot/hiking/running/bicycle) AND named ways (footway/path/cycleway/track)
- Filters ways < 200m
- Parses geometry from relation members or way geometry

### Waymarked Trails API (`fetchWaymarkedRoutes`)
- Maps activity to path: hiking → `hiking`, cycling → `cycling`
- Fetches list from `hiking.waymarkedtrails.org/api/v1/list`
- Fetches GeoJSON geometry for each trail

Results are deduplicated by `lat,lng` of first point, sorted by distance from center.

---

## 10. UI Architecture (index.html + index.css)

### Panel Layout (fixed position)
| panel | position | content |
|-------|----------|---------|
| `.panel-connection` | top-left | Host/port, Connect button, status |
| `.panel-info` | top-right | Coordinates, live stats (speed, pace, elapsed, distance, gradient, altitude, progress bar) |
| `.panel-route` | bottom-left | Mode toggle, routing mode, profiles, settings, controls, save/load, speed multiplier, export |

### Live Stats Display (panel-info, shown during simulation)
| stat | element ID | format |
|------|-----------|--------|
| Speed | `currentSpeedDisplay` | `XX.X` km/h |
| Pace | `paceDisplay` | `M:SS` /km |
| Altitude | `altitudeDisplay` | `XXX` m |
| Distance | `distanceDisplay` | `X.XX` km or `XXX` m |
| Gradient | `gradientDisplay` | `±X.X` % |
| Elapsed | `elapsedDisplay` | `MM:SS` or `H:MM:SS` |
| Progress | `progressFill` + `progressText` | bar + `XX.X%` |

### Route Panel Sections (conditionally shown)
1. **Mode toggle**: Point / Route / GPX / Random / Search
2. **Routing mode toggle** (Route mode only): Road Snap / Freeform
3. **Random run controls**: Radius slider, Distance slider, Shape dropdown, Generate/Clear
4. **Search controls**: Radius slider, search results list
5. **Route controls** (shown when route exists): Activity profiles, waypoint count, save/load, speed slider, GPS noise, loop mode, auto-pause, start/pause/stop/clear
6. **Speed multiplier** (shown during simulation): 1×/2×/5×/10× buttons
7. **Export GPX** (shown during/after simulation): download button
8. **Advanced settings** (collapsible): pace variation, turn slow, gradient effect, warmup/cooldown, intersection chance/duration, rest interval/duration

### Scrolling
Route panel has `max-height: calc(100vh - 40px)` with `overflow-y: auto` and a thin custom scrollbar for small screens.

---

## 11. Important Conventions & Gotchas

### Coordinate Order
- **OSRM / GeoJSON**: `lng, lat` (longitude first)
- **Leaflet / Internal**: `lat, lng` (latitude first)
- **Emulator `geo fix` command**: `geo fix {longitude} {latitude} {altitude}` (longitude first!)

### Default Map Center
Hanoi, Vietnam: `[21.0285, 105.8542]` — hardcoded in `initMap()`.

### External API Rate Limits
- **OSRM public server**: No official rate limit but may 429 on heavy use. No retry logic.
- **Open-Meteo**: Free, 10,000 requests/day. Supports up to 100 coordinate pairs per request.
- **Overpass API**: Shared public server, can be slow. 30s timeout in query.

### Route Polyline Colors
| context | color |
|---------|-------|
| Road-snapped route | `#34d399` (green) |
| Freeform route | `#f59e0b` (amber) |
| Preview/waypoint line | `#6387ff` (blue, dashed) |
| Random route | `#a78bfa` (purple, for radius circle) |
| GPX import | `#fb923c` (orange) |
| Community route preview | `#38bdf8` (sky blue) |

### Port
Server listens on `process.env.PORT || 3001`. Emulator default: `localhost:5554`.

### Server Restart
Changes to `server.js` require server restart. `npm run dev` uses `--watch` for auto-reload.

---

## 12. Feature Changelog (recent)

1. **Gaussian GPS Jitter** — Replaced sinusoidal noise with random walk + Box-Muller + urban density
2. **5 GPS Quality Presets** — Premium Watch → Phone Poor, research-calibrated
3. **Natural Random Routes** — 3 organic strategies (out-and-back, lollipop, organic blob) with shape selector
4. **Freeform Walk Mode** — Direct connect + Catmull-Rom spline smoothing, no OSRM
5. **GPX Export** — Records simulated track (with jitter) every ~1s, exports as GPX 1.1
6. **Progress Bar + Elapsed Time** — Real-time progress %, elapsed MM:SS
7. **Pace Display** — Live min:sec/km conversion
8. **Speed Multiplier** — 1×/2×/5×/10× simulation speed
9. **Save/Load Configurations** — localStorage persistence of route + all settings
10. **Ctrl+Z Undo Waypoint** — Remove last clicked waypoint, re-process route
11. **Scrollable Route Panel** — max-height with overflow for small screens
