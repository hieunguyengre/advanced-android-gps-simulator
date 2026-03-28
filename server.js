const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// --- Route API proxy (OSRM foot + fallback) ---
app.get('/api/route', async (req, res) => {
  const { coordinates } = req.query;
  if (!coordinates) return res.status(400).json({ error: 'Missing coordinates' });

  try {
    // Use OSRM foot profile (public demo server supports foot routing)
    const url = `https://router.project-osrm.org/route/v1/foot/${coordinates}?overview=full&geometries=geojson&steps=false&alternatives=false`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Elevation API proxy (Open-Meteo — free, no key) ---
app.get('/api/elevation', async (req, res) => {
  const { lats, lngs } = req.query;
  if (!lats || !lngs) return res.status(400).json({ error: 'Missing lats/lngs' });
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Random Route Generation API ---
app.get('/api/random-route', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseInt(req.query.radius) || 500;        // meters
  const targetDistance = parseFloat(req.query.distance) || 3; // km

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Missing or invalid lat/lng' });
  }

  try {
    // Generate random waypoints forming a closed loop
    const waypoints = generateRandomLoopWaypoints(lat, lng, radius, targetDistance);

    // Build OSRM coordinate string (lng,lat format)
    const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      // If OSRM fails, try with fewer waypoints
      const simpleWaypoints = [waypoints[0], waypoints[Math.floor(waypoints.length / 3)], waypoints[Math.floor(waypoints.length * 2 / 3)], waypoints[waypoints.length - 1]];
      const simpleCoords = simpleWaypoints.map(w => `${w.lng},${w.lat}`).join(';');
      const retryUrl = `https://router.project-osrm.org/route/v1/foot/${simpleCoords}?overview=full&geometries=geojson&steps=false&alternatives=false`;
      const retryResp = await fetch(retryUrl);
      const retryData = await retryResp.json();
      return res.json(retryData);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Generate waypoints for a natural-looking running route loop.
 * Uses multiple shape strategies to avoid the "perfect circle" look:
 *   1. Out-and-back with side exploration (most common real running pattern)
 *   2. Figure-8 / Lollipop (run somewhere, loop, come back)
 *   3. Organic irregular shape (Perlin-like noise for non-circular blob)
 */
function generateRandomLoopWaypoints(centerLat, centerLng, radiusMeters, targetDistanceKm) {
  const latPerMeter = 1 / 111320;
  const lngPerMeter = 1 / (111320 * Math.cos(centerLat * Math.PI / 180));

  // Pick a random shape strategy
  const strategy = Math.random();
  let waypoints;

  if (strategy < 0.35) {
    waypoints = _generateOutAndBack(centerLat, centerLng, radiusMeters, targetDistanceKm, latPerMeter, lngPerMeter);
  } else if (strategy < 0.6) {
    waypoints = _generateLollipop(centerLat, centerLng, radiusMeters, targetDistanceKm, latPerMeter, lngPerMeter);
  } else {
    waypoints = _generateOrganicLoop(centerLat, centerLng, radiusMeters, targetDistanceKm, latPerMeter, lngPerMeter);
  }

  return waypoints;
}

/**
 * Strategy 1: Out-and-back with a side exploration loop.
 * Simulates a runner going out, exploring an area off to one side, then returning via
 * a slightly different path. Very natural — most casual runners do this.
 */
function _generateOutAndBack(cLat, cLng, radius, distKm, latPM, lngPM) {
  const wp = [];
  const mainAngle = Math.random() * Math.PI * 2;
  const sideDir = Math.random() < 0.5 ? 1 : -1; // explore left or right

  // Start
  wp.push({ lat: cLat, lng: cLng });

  // Go outward (3-4 waypoints along main direction)
  const outSteps = 2 + Math.floor(Math.random() * 2);
  for (let i = 1; i <= outSteps; i++) {
    const frac = i / (outSteps + 1);
    const dist = radius * frac * (0.7 + Math.random() * 0.5);
    // Slight zigzag along the main direction
    const angleJitter = (Math.random() - 0.5) * 0.4;
    const sideShift = sideDir * Math.random() * radius * 0.15 * frac;
    const dLat = dist * Math.cos(mainAngle + angleJitter) * latPM + sideShift * Math.cos(mainAngle + Math.PI / 2) * latPM;
    const dLng = dist * Math.sin(mainAngle + angleJitter) * lngPM + sideShift * Math.sin(mainAngle + Math.PI / 2) * lngPM;
    wp.push({ lat: cLat + dLat, lng: cLng + dLng });
  }

  // Side exploration loop (2-3 waypoints off the main path)
  const turnaroundDist = radius * (0.7 + Math.random() * 0.4);
  const loopPoints = 2 + Math.floor(Math.random() * 2);
  const loopAngleStart = mainAngle + sideDir * (0.4 + Math.random() * 0.6);
  for (let i = 0; i < loopPoints; i++) {
    const frac = i / loopPoints;
    const loopAngle = loopAngleStart + frac * sideDir * Math.PI * 0.6;
    const loopR = turnaroundDist * (0.5 + Math.random() * 0.5);
    wp.push({
      lat: cLat + loopR * Math.cos(loopAngle) * latPM,
      lng: cLng + loopR * Math.sin(loopAngle) * lngPM
    });
  }

  // Return path (slightly different from outward path — offset to opposite side)
  for (let i = outSteps; i >= 1; i--) {
    const frac = i / (outSteps + 1);
    const dist = radius * frac * (0.5 + Math.random() * 0.4);
    const offsetAngle = mainAngle + (Math.random() - 0.5) * 0.5;
    const returnShift = -sideDir * radius * 0.12 * frac;
    const dLat = dist * Math.cos(offsetAngle) * latPM + returnShift * Math.cos(mainAngle + Math.PI / 2) * latPM;
    const dLng = dist * Math.sin(offsetAngle) * lngPM + returnShift * Math.sin(mainAngle + Math.PI / 2) * lngPM;
    wp.push({ lat: cLat + dLat, lng: cLng + dLng });
  }

  // Return to start
  wp.push({ lat: cLat, lng: cLng });
  return wp;
}

/**
 * Strategy 2: Lollipop / Figure-8.
 * Run from start to a distant area, do a small loop there, then come back.
 * Like running to a park, doing a lap, and running home.
 */
function _generateLollipop(cLat, cLng, radius, distKm, latPM, lngPM) {
  const wp = [];
  const stickAngle = Math.random() * Math.PI * 2;
  const stickLength = radius * (0.6 + Math.random() * 0.4);

  // Start
  wp.push({ lat: cLat, lng: cLng });

  // "Stick" portion — walk to loop center (2-3 intermediate points)
  const stickSteps = 2 + Math.floor(Math.random());
  const loopCenterLat = cLat + stickLength * Math.cos(stickAngle) * latPM;
  const loopCenterLng = cLng + stickLength * Math.sin(stickAngle) * lngPM;

  for (let i = 1; i <= stickSteps; i++) {
    const frac = i / (stickSteps + 1);
    const jitter = (Math.random() - 0.5) * radius * 0.1;
    wp.push({
      lat: cLat + frac * (loopCenterLat - cLat) + jitter * latPM,
      lng: cLng + frac * (loopCenterLng - cLng) + jitter * lngPM
    });
  }

  // "Lollipop" loop — circle around the loop center (4-6 points)
  const loopRadius = radius * (0.25 + Math.random() * 0.3);
  const loopSteps = 4 + Math.floor(Math.random() * 3);
  const loopStart = Math.random() * Math.PI * 2;
  const loopDir = Math.random() < 0.5 ? 1 : -1;

  for (let i = 0; i < loopSteps; i++) {
    const frac = (i + 1) / (loopSteps + 1);
    const angle = loopStart + loopDir * frac * Math.PI * 2;
    // Add radius variation so it's not a perfect circle
    const rVar = loopRadius * (0.7 + Math.random() * 0.5);
    wp.push({
      lat: loopCenterLat + rVar * Math.cos(angle) * latPM,
      lng: loopCenterLng + rVar * Math.sin(angle) * lngPM
    });
  }

  // Return along the stick (slightly different path)
  for (let i = stickSteps; i >= 1; i--) {
    const frac = i / (stickSteps + 1);
    const jitter = (Math.random() - 0.5) * radius * 0.15;
    wp.push({
      lat: cLat + frac * (loopCenterLat - cLat) + jitter * latPM,
      lng: cLng + frac * (loopCenterLng - cLng) + jitter * lngPM
    });
  }

  // Return to start
  wp.push({ lat: cLat, lng: cLng });
  return wp;
}

/**
 * Strategy 3: Organic irregular loop.
 * Uses layered sine waves (Perlin-like noise) to create a non-circular blob shape.
 * Much more natural than a simple circle with jittered points.
 */
function _generateOrganicLoop(cLat, cLng, radius, distKm, latPM, lngPM) {
  const wp = [];
  const numPoints = Math.min(10, Math.max(5, Math.round(targetDistanceKm_to_points(distKm))));
  const angleOffset = Math.random() * Math.PI * 2;

  // Generate organic noise phases for radius variation
  const phases = [
    { freq: 2 + Math.random(), amp: 0.3 + Math.random() * 0.2, phase: Math.random() * Math.PI * 2 },
    { freq: 3 + Math.random() * 2, amp: 0.15 + Math.random() * 0.1, phase: Math.random() * Math.PI * 2 },
    { freq: 5 + Math.random() * 3, amp: 0.08 + Math.random() * 0.05, phase: Math.random() * Math.PI * 2 }
  ];

  // Start
  wp.push({ lat: cLat, lng: cLng });

  for (let i = 0; i < numPoints; i++) {
    const frac = i / numPoints;
    const baseAngle = angleOffset + frac * Math.PI * 2;

    // Multi-frequency radius modulation (organic shape)
    let radiusMod = 0.6;
    for (const p of phases) {
      radiusMod += p.amp * Math.sin(frac * Math.PI * 2 * p.freq + p.phase);
    }
    radiusMod = Math.max(0.25, Math.min(1.1, radiusMod));

    // Add per-point jitter to angle
    const angleJitter = (Math.random() - 0.5) * (Math.PI * 2 / numPoints) * 0.4;
    const finalAngle = baseAngle + angleJitter;
    const finalRadius = radius * radiusMod;

    wp.push({
      lat: cLat + finalRadius * Math.cos(finalAngle) * latPM,
      lng: cLng + finalRadius * Math.sin(finalAngle) * lngPM
    });
  }

  // Close the loop
  wp.push({ lat: cLat, lng: cLng });
  return wp;
}

function targetDistanceKm_to_points(distKm) {
  // More points for longer routes, but cap at 10
  return Math.round(distKm * 1.8 + 2);
}

// --- Search Routes API (Multi-Source: Overpass + Waymarked Trails) ---
app.get('/api/search-routes', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseInt(req.query.radius) || 5000; // meters

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Missing or invalid lat/lng' });
  }

  try {
    // Query all sources in parallel
    const [overpassRoutes, wmHikingRoutes, wmCyclingRoutes] = await Promise.allSettled([
      fetchOverpassRoutes(lat, lng, radius),
      fetchWaymarkedTrails('hiking', lat, lng, radius),
      fetchWaymarkedTrails('cycling', lat, lng, radius),
    ]);

    // Merge results from all sources
    let allRoutes = [];
    if (overpassRoutes.status === 'fulfilled') allRoutes.push(...overpassRoutes.value);
    if (wmHikingRoutes.status === 'fulfilled') allRoutes.push(...wmHikingRoutes.value);
    if (wmCyclingRoutes.status === 'fulfilled') allRoutes.push(...wmCyclingRoutes.value);

    // Deduplicate by name + approximate distance (some routes appear in multiple sources)
    const seen = new Set();
    allRoutes = allRoutes.filter(r => {
      const key = `${r.name}|${Math.round(r.distance)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by distance from center
    allRoutes.sort((a, b) => a.distFromCenter - b.distFromCenter);

    res.json({ routes: allRoutes, total: allRoutes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Source 1: Overpass API — route relations + named ways
 */
async function fetchOverpassRoutes(lat, lng, radius) {
  // Expanded query: route relations (more types) + named ways (paths, footways, cycleways)
  const query = `
    [out:json][timeout:30];
    (
      relation["type"="route"]["route"~"foot|hiking|running|bicycle|mtb|fitness_trail"](around:${radius},${lat},${lng});
      way["highway"~"footway|path|cycleway|track"]["name"](around:${radius},${lat},${lng});
    );
    out geom;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`
  });

  if (!response.ok) throw new Error(`Overpass API returned ${response.status}`);

  const data = await response.json();
  return parseOverpassElements(data.elements || [], lat, lng);
}

/**
 * Parse Overpass API response — handles both relations and ways.
 */
function parseOverpassElements(elements, centerLat, centerLng) {
  const routes = [];

  for (const el of elements) {
    const tags = el.tags || {};
    let geometry = [];
    let routeType = 'foot';

    if (el.type === 'relation') {
      routeType = tags.route || 'foot';
      if (el.members) {
        for (const member of el.members) {
          if (member.type === 'way' && member.geometry) {
            for (const point of member.geometry) {
              geometry.push({ lat: point.lat, lng: point.lon });
            }
          }
        }
      }
    } else if (el.type === 'way') {
      // Named ways (footway, path, cycleway, track)
      const hw = tags.highway || '';
      if (hw === 'cycleway') routeType = 'bicycle';
      else if (hw === 'track') routeType = 'hiking';
      else routeType = 'foot';

      if (el.geometry) {
        for (const point of el.geometry) {
          geometry.push({ lat: point.lat, lng: point.lon });
        }
      }
    } else {
      continue;
    }

    if (geometry.length < 2) continue;

    // Calculate total distance
    let totalDistance = 0;
    for (let i = 0; i < geometry.length - 1; i++) {
      totalDistance += haversineDistance(
        geometry[i].lat, geometry[i].lng,
        geometry[i + 1].lat, geometry[i + 1].lng
      );
    }

    // Skip very short ways (< 200m) — noise filter
    if (el.type === 'way' && totalDistance < 200) continue;

    const name = tags.name || tags['name:en'] || tags.ref || 'Unnamed Route';
    const taggedDistKm = tags.distance ? parseFloat(tags.distance) : null;
    const distanceKm = taggedDistKm || (totalDistance / 1000);
    const distFromCenter = haversineDistance(centerLat, centerLng, geometry[0].lat, geometry[0].lng);

    routes.push({
      id: el.id,
      name, type: routeType, source: 'osm',
      distance: Math.round(distanceKm * 100) / 100,
      distFromCenter: Math.round(distFromCenter),
      points: geometry.length,
      geometry,
      tags: {
        surface: tags.surface, network: tags.network,
        operator: tags.operator, description: tags.description,
        website: tags.website
      }
    });
  }

  return routes;
}

/**
 * Source 2 & 3: Waymarked Trails API — hiking and cycling trails
 */
async function fetchWaymarkedTrails(activity, lat, lng, radius) {
  // Convert center + radius to bounding box
  const latDeg = radius / 111320;
  const lngDeg = radius / (111320 * Math.cos(lat * Math.PI / 180));
  const bbox = `${lng - lngDeg},${lat - latDeg},${lng + lngDeg},${lat + latDeg}`;

  const baseUrl = activity === 'cycling'
    ? 'https://cycling.waymarkedtrails.org'
    : 'https://hiking.waymarkedtrails.org';

  const response = await fetch(`${baseUrl}/api/v1/list/by-bbox?bbox=${bbox}&limit=30`, {
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) return [];

  const data = await response.json();
  if (!data.results || !Array.isArray(data.results)) return [];

  const routes = [];
  for (const trail of data.results) {
    // Fetch geometry for each trail
    let geometry = [];
    try {
      const geoResp = await fetch(`${baseUrl}/api/v1/details/${trail.id}/geometry/geojson`, {
        headers: { 'Accept': 'application/json' }
      });
      if (geoResp.ok) {
        const geoData = await geoResp.json();
        if (geoData.type === 'FeatureCollection' && geoData.features) {
          for (const feature of geoData.features) {
            if (feature.geometry && feature.geometry.coordinates) {
              const coords = feature.geometry.type === 'MultiLineString'
                ? feature.geometry.coordinates.flat()
                : feature.geometry.coordinates;
              for (const c of coords) {
                geometry.push({ lat: c[1], lng: c[0] });
              }
            }
          }
        } else if (geoData.coordinates) {
          const coords = geoData.type === 'MultiLineString'
            ? geoData.coordinates.flat()
            : geoData.coordinates;
          for (const c of coords) {
            geometry.push({ lat: c[1], lng: c[0] });
          }
        }
      }
    } catch { /* skip geometry fetch failure */ }

    if (geometry.length < 2) continue;

    const distFromCenter = haversineDistance(lat, lng, geometry[0].lat, geometry[0].lng);

    // Calculate distance from geometry if not provided
    let totalDist = 0;
    for (let i = 0; i < geometry.length - 1; i++) {
      totalDist += haversineDistance(geometry[i].lat, geometry[i].lng, geometry[i + 1].lat, geometry[i + 1].lng);
    }
    const distKm = trail.distance ? trail.distance / 1000 : totalDist / 1000;

    routes.push({
      id: `wmt-${trail.id}`,
      name: trail.name || trail.ref || 'Waymarked Trail',
      type: activity === 'cycling' ? 'bicycle' : 'hiking',
      source: 'waymarked',
      distance: Math.round(distKm * 100) / 100,
      distFromCenter: Math.round(distFromCenter),
      points: geometry.length,
      geometry,
      tags: {
        network: trail.group,
        description: trail.name,
        website: `${baseUrl}/#route?id=${trail.id}`
      }
    });
  }

  return routes;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Telnet Connection Manager ---
class EmulatorConnection {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.host = 'localhost';
    this.port = 5554;
    this.responseBuffer = '';
    this.onResponse = null;
  }

  async connect(host, port) {
    this.host = host || 'localhost';
    this.port = port || 5554;
    return new Promise((resolve, reject) => {
      if (this.socket) this.socket.destroy();
      this.socket = new net.Socket();
      this.socket.setTimeout(5000);
      this.socket.connect(this.port, this.host, () => { this.connected = true; });

      let bannerReceived = false;
      this.socket.on('data', (data) => {
        const text = data.toString();
        this.responseBuffer += text;
        if (!bannerReceived && this.responseBuffer.includes('OK')) {
          bannerReceived = true;
          this.responseBuffer = '';
          this._autoAuth()
            .then(() => resolve({ success: true, message: 'Connected and authenticated' }))
            .catch((err) => resolve({ success: true, message: 'Connected but auth failed: ' + err.message }));
        }
        if (this.onResponse && bannerReceived) this.onResponse(text);
      });
      this.socket.on('error', (err) => { this.connected = false; this.authenticated = false; reject(new Error('Connection failed: ' + err.message)); });
      this.socket.on('close', () => { this.connected = false; this.authenticated = false; });
      this.socket.on('timeout', () => { if (!bannerReceived) { this.socket.destroy(); reject(new Error('Connection timed out')); } });
    });
  }

  async _autoAuth() {
    const tokenPath = path.join(os.homedir(), '.emulator_console_auth_token');
    try {
      const token = fs.readFileSync(tokenPath, 'utf8').trim();
      if (!token) { this.authenticated = true; return; }
      const response = await this._sendCommand(`auth ${token}`);
      if (response.includes('OK')) this.authenticated = true;
      else throw new Error('Authentication rejected');
    } catch (err) {
      if (err.code === 'ENOENT') this.authenticated = true;
      else throw err;
    }
  }

  _sendCommand(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) { reject(new Error('Not connected')); return; }
      let response = '';
      const timeout = setTimeout(() => { this.onResponse = null; resolve(response || 'OK (timeout)'); }, 2000);
      this.onResponse = (text) => {
        response += text;
        if (response.includes('OK') || response.includes('KO')) {
          clearTimeout(timeout);
          this.onResponse = null;
          resolve(response);
        }
      };
      this.socket.write(cmd + '\r\n');
    });
  }

  async setLocation(latitude, longitude, altitude = 0) {
    if (!this.connected) throw new Error('Not connected to emulator');
    const cmd = `geo fix ${longitude} ${latitude} ${altitude}`;
    return await this._sendCommand(cmd);
  }

  disconnect() {
    if (this.socket) { this.socket.write('quit\r\n'); this.socket.destroy(); this.socket = null; }
    this.connected = false;
    this.authenticated = false;
  }

  getStatus() {
    return { connected: this.connected, authenticated: this.authenticated, host: this.host, port: this.port };
  }
}

// ====================================================================
// NATURAL SPEED ENGINE
// Generates human-like speed variations
// ====================================================================
class NaturalSpeedEngine {
  constructor(baseSpeedKmh, advanced = {}) {
    this.baseSpeed = baseSpeedKmh;
    this.currentSpeed = baseSpeedKmh;

    // Custom parameters (defaults = recommended)
    this.paceVariation = advanced.paceVariation ?? 1.0;   // 0=constant, 1=natural
    this.turnSlowdownMax = advanced.turnSlowdown ?? 0.40;  // max % slowdown at sharp turns
    this.gradientEffect = advanced.gradientEffect ?? 1.0;  // 0=ignore hills, 1=realistic
    this.warmupOverride = advanced.warmupDuration || 0;     // 0=auto
    this.cooldownOverride = advanced.cooldownDuration || 0; // 0=auto

    // Pace drift — slow sine waves (scaled by paceVariation)
    this.driftPhase1 = Math.random() * Math.PI * 2;
    this.driftPhase2 = Math.random() * Math.PI * 2;
    this.driftFreq1 = 0.015 + Math.random() * 0.01;
    this.driftFreq2 = 0.007 + Math.random() * 0.005;
    this.driftAmp1 = (0.04 + Math.random() * 0.04) * this.paceVariation;
    this.driftAmp2 = (0.03 + Math.random() * 0.03) * this.paceVariation;

    // Micro-fluctuation
    this.microOffset = 0;
    this.microVelocity = 0;
    this.microScale = this.paceVariation;

    this.elapsed = 0;
  }

  getSpeed(deltaMs, options = {}) {
    this.elapsed += deltaMs / 1000;

    // 1. Pace drift
    const drift1 = Math.sin(this.elapsed * this.driftFreq1 + this.driftPhase1) * this.driftAmp1;
    const drift2 = Math.sin(this.elapsed * this.driftFreq2 + this.driftPhase2) * this.driftAmp2;

    // 2. Micro-fluctuation
    this.microVelocity += (Math.random() - 0.5) * 0.008 * this.microScale;
    this.microVelocity *= 0.9;
    this.microOffset += this.microVelocity;
    const maxMicro = 0.02 * this.microScale;
    this.microOffset = Math.max(-maxMicro, Math.min(maxMicro, this.microOffset));

    // 3. Warm-up / Cool-down
    let phaseMultiplier = 1.0;
    if (options.totalDuration) {
      const warmupDuration = this.warmupOverride > 0
        ? this.warmupOverride
        : Math.min(180, options.totalDuration * 0.1);
      const cooldownLen = this.cooldownOverride > 0
        ? this.cooldownOverride
        : Math.min(120, options.totalDuration * 0.08);
      const cooldownStart = options.totalDuration - cooldownLen;

      if (warmupDuration > 0 && this.elapsed < warmupDuration) {
        const t = this.elapsed / warmupDuration;
        phaseMultiplier = 0.55 + 0.45 * (t * t * (3 - 2 * t));
      } else if (cooldownLen > 0 && this.elapsed > cooldownStart) {
        const t = (this.elapsed - cooldownStart) / cooldownLen;
        phaseMultiplier = 1.0 - 0.4 * (t * t * (3 - 2 * t));
      }
    }

    // 4. Turn slowdown (uses custom max slowdown)
    let turnMultiplier = 1.0;
    if (this.turnSlowdownMax > 0 && options.turnAngle !== undefined && options.turnAngle > 20) {
      turnMultiplier = 1.0 - Math.min(this.turnSlowdownMax, (options.turnAngle / 180) * this.turnSlowdownMax);
    }

    // 5. Gradient multiplier (scaled by gradientEffect)
    let gradientMultiplier = 1.0;
    if (this.gradientEffect > 0 && options.gradient !== undefined) {
      if (options.gradient > 0) {
        gradientMultiplier = Math.max(0.6, 1.0 - options.gradient * 0.03 * this.gradientEffect);
      } else {
        gradientMultiplier = Math.min(1.15, 1.0 - options.gradient * 0.015 * this.gradientEffect);
      }
    }

    this.currentSpeed = this.baseSpeed
      * (1 + drift1 + drift2 + this.microOffset)
      * phaseMultiplier
      * turnMultiplier
      * gradientMultiplier;

    this.currentSpeed = Math.max(this.baseSpeed * 0.3, this.currentSpeed);
    return this.currentSpeed;
  }

  setBaseSpeed(speed) {
    this.baseSpeed = speed;
  }
}

// ====================================================================
// GPS JITTER ENGINE — Research-based GPS noise simulation
// Based on real GPS data analysis from Strava/DC Rainmaker:
// - Premium watch (dual-band): ~0.5m deviation
// - Standard watch: ~1.5m deviation
// - Phone (good): ~2m, urban: ~4m, poor: ~6m
// Key insight: real GPS noise is random walk, NOT sinusoidal
// ====================================================================
class GPSJitter {
  constructor() {
    this.enabled = true;
    this.intensity = 1.0;       // base multiplier (preset-controlled)
    this.urbanMultBase = 0.5;   // urban noise factor (preset-controlled)
    this.offsetLat = 0;
    this.offsetLng = 0;
    this.velocityLat = 0;
    this.velocityLng = 0;
    this.lapSeed = 0;

    // Stationary drift state
    this.stationaryDriftLat = 0;
    this.stationaryDriftLng = 0;
    this.stationaryDriftVelLat = 0;
    this.stationaryDriftVelLng = 0;
    this.stationaryTimer = 0;

    // Smooth Gaussian noise state
    this._gaussSpare = null;
    this._gaussHasSpare = false;
  }

  setLapSeed(seed) {
    this.lapSeed = seed;
    // Small initial offset per lap (different starting bias)
    this.offsetLat = (this._seededRandom(seed * 1000) - 0.5) * 0.000008 * this.intensity;
    this.offsetLng = (this._seededRandom(seed * 2000) - 0.5) * 0.000008 * this.intensity;
  }

  _seededRandom(seed) {
    const x = Math.sin(seed) * 43758.5453;
    return x - Math.floor(x);
  }

  // Box-Muller Gaussian random (mean=0, std=1)
  _gaussRandom() {
    if (this._gaussHasSpare) {
      this._gaussHasSpare = false;
      return this._gaussSpare;
    }
    let u, v, s;
    do {
      u = Math.random() * 2 - 1;
      v = Math.random() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    s = Math.sqrt(-2.0 * Math.log(s) / s);
    this._gaussSpare = v * s;
    this._gaussHasSpare = true;
    return u * s;
  }

  // urbanDensity: 0=open area, 1=dense urban (from turn density analysis)
  // isStationary: true when paused/resting
  apply(lat, lng, progress, urbanDensity = 0, isStationary = false) {
    if (!this.enabled) return { lat, lng };

    // Urban multiplier: scales with preset-defined sensitivity
    const urbanMultiplier = 1.0 + urbanDensity * this.urbanMultBase;
    const effectiveIntensity = this.intensity * urbanMultiplier;

    if (isStationary) {
      return this._applyStationaryDrift(lat, lng, effectiveIntensity);
    }

    // === MOVING JITTER — Gaussian random walk ===
    // 1 degree ≈ 111,320m, so 0.00001° ≈ 1.1m
    // Target: effectiveIntensity=1.0 → ~1.5m max deviation
    const noiseScale = 0.000008 * effectiveIntensity;  // ~0.9m per unit
    const maxOffset = 0.000015 * effectiveIntensity;   // clamp radius

    // Gaussian acceleration (smooth random walk, not choppy)
    this.velocityLat += this._gaussRandom() * noiseScale * 0.08;
    this.velocityLng += this._gaussRandom() * noiseScale * 0.08;

    // Mean-reversion: pulls offset back toward center (stronger = tighter trace)
    // Higher intensity = weaker reversion = more wandering
    const reversion = Math.max(0.04, 0.15 / Math.max(0.5, effectiveIntensity));
    this.velocityLat -= this.offsetLat * reversion;
    this.velocityLng -= this.offsetLng * reversion;

    // Damping (prevents runaway velocity)
    const damping = 0.88;
    this.velocityLat *= damping;
    this.velocityLng *= damping;

    this.offsetLat += this.velocityLat;
    this.offsetLng += this.velocityLng;

    // Hard clamp
    this.offsetLat = Math.max(-maxOffset, Math.min(maxOffset, this.offsetLat));
    this.offsetLng = Math.max(-maxOffset, Math.min(maxOffset, this.offsetLng));

    // Reset stationary state
    this.stationaryDriftLat = 0;
    this.stationaryDriftLng = 0;
    this.stationaryTimer = 0;

    return {
      lat: lat + this.offsetLat,
      lng: lng + this.offsetLng
    };
  }

  _applyStationaryDrift(lat, lng, intensity) {
    // GPS wanders when stopped — slow random walk
    // Real behavior: ~1-2m cluster for watch, ~2-4m for phone
    this.stationaryTimer++;

    const maxDrift = 0.000012 * intensity;     // ~1.3m per unit
    const driftForce = 0.0000005 * intensity;

    // Slow-changing force (updates every ~3-5 seconds)
    const slowSeed1 = Math.floor(this.stationaryTimer / 40);
    const slowSeed2 = Math.floor(this.stationaryTimer / 55) + 1000;

    this.stationaryDriftVelLat += (this._seededRandom(slowSeed1 + lat * 10000) - 0.5) * driftForce;
    this.stationaryDriftVelLng += (this._seededRandom(slowSeed2 + lng * 10000) - 0.5) * driftForce;

    // Mean reversion + damping
    this.stationaryDriftVelLat -= this.stationaryDriftLat * 0.05;
    this.stationaryDriftVelLng -= this.stationaryDriftLng * 0.05;
    this.stationaryDriftVelLat *= 0.88;
    this.stationaryDriftVelLng *= 0.88;

    this.stationaryDriftLat += this.stationaryDriftVelLat;
    this.stationaryDriftLng += this.stationaryDriftVelLng;

    // Clamp
    this.stationaryDriftLat = Math.max(-maxDrift, Math.min(maxDrift, this.stationaryDriftLat));
    this.stationaryDriftLng = Math.max(-maxDrift, Math.min(maxDrift, this.stationaryDriftLng));

    return {
      lat: lat + this.stationaryDriftLat,
      lng: lng + this.stationaryDriftLng
    };
  }
}

// ====================================================================
// ROUTE SIMULATOR (Enhanced — signal quality + auto-pause)
// ====================================================================
class RouteSimulator {
  constructor(connection, broadcastFn) {
    this.connection = connection;
    this.broadcast = broadcastFn;
    this.routePoints = [];
    this.elevations = [];
    this.running = false;
    this.paused = false;
    this.currentIndex = 0;
    this.progress = 0;
    this.currentLat = 0;
    this.currentLng = 0;
    this.currentAlt = 0;
    this.intervalId = null;
    this.jitter = new GPSJitter();
    this.speedEngine = null;

    // Loop
    this.loopMode = false;
    this.currentLap = 0;
    this.totalLaps = 1;
    this.totalDistance = 0;
    this.coveredDistance = 0;

    // Turn angles (precomputed)
    this.turnAngles = [];
    // Urban density per point (precomputed from turn density)
    this.urbanDensity = [];

    // Estimated total duration
    this.estimatedDuration = 0;

    // Auto-pause state
    this.autoPauseEnabled = true;
    this.isAutoPaused = false;
    this.autoPauseRemaining = 0;
    this.autoPauseReason = '';
    this.lastRestDistance = 0;
    this.nextRestDistance = 0;
    this.pausedLat = 0;
    this.pausedLng = 0;
    this.lastPausedAtIndex = -1; // prevents re-triggering at same turn

    // Custom advanced settings (with defaults)
    this.adv = {
      intersectionChance: 0.35,
      intersectionDurMin: 10000,
      intersectionDurMax: 45000,
      restIntervalMin: 2000,
      restIntervalMax: 5000,
      restDurMin: 30000,
      restDurMax: 90000
    };
  }

  start(routePoints, speedKmh, elevations, options = {}) {
    this.routePoints = routePoints;
    this.elevations = elevations || [];
    this.currentIndex = 0;
    this.progress = 0;
    this.running = true;
    this.paused = false;
    this.currentLap = 0;
    this.isAutoPaused = false;
    this.autoPauseRemaining = 0;
    this.lastRestDistance = 0;

    this.loopMode = options.loop || false;
    this.totalLaps = options.laps || 1;
    this.jitter.enabled = options.jitter !== false;
    this.jitter.intensity = options.jitterIntensity || 1.0;
    this.jitter.urbanMultBase = options.jitterUrbanMult ?? 0.5;
    this.jitter.setLapSeed(0);
    this.autoPauseEnabled = options.autoPause !== false;

    // Apply custom advanced settings
    const adv = options.advanced || {};
    this.adv.intersectionChance = adv.intersectionChance ?? 0.35;
    this.adv.intersectionDurMin = adv.intersectionDurMin ?? 10000;
    this.adv.intersectionDurMax = adv.intersectionDurMax ?? 45000;
    this.adv.restIntervalMin = adv.restIntervalMin ?? 2000;
    this.adv.restIntervalMax = adv.restIntervalMax ?? 5000;
    this.adv.restDurMin = adv.restDurMin ?? 30000;
    this.adv.restDurMax = adv.restDurMax ?? 90000;

    // Schedule first rest stop
    this.nextRestDistance = this.adv.restIntervalMin + Math.random() * (this.adv.restIntervalMax - this.adv.restIntervalMin);

    this.speedEngine = new NaturalSpeedEngine(speedKmh || 10, adv);
    this.totalDistance = this._calcTotalDistance();
    this.coveredDistance = 0;

    const avgSpeedMs = (speedKmh * 1000) / 3600;
    this.estimatedDuration = (this.totalDistance * (this.loopMode ? this.totalLaps : 1)) / avgSpeedMs;

    this._precomputeTurnAngles();
    this._precomputeUrbanDensity();

    if (routePoints.length < 2) return;

    this.currentLat = routePoints[0].lat;
    this.currentLng = routePoints[0].lng;
    this.currentAlt = this.elevations[0] || 0;

    const updateInterval = 100;
    this.intervalId = setInterval(() => {
      if (this.paused || !this.running) return;
      this._step(updateInterval);
    }, updateInterval);
  }

  _precomputeTurnAngles() {
    this.turnAngles = new Array(this.routePoints.length).fill(0);
    for (let i = 1; i < this.routePoints.length - 1; i++) {
      const prev = this.routePoints[i - 1];
      const curr = this.routePoints[i];
      const next = this.routePoints[i + 1];
      const v1x = curr.lng - prev.lng;
      const v1y = curr.lat - prev.lat;
      const v2x = next.lng - curr.lng;
      const v2y = next.lat - curr.lat;
      const dot = v1x * v2x + v1y * v2y;
      const cross = v1x * v2y - v1y * v2x;
      this.turnAngles[i] = Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
    }
  }

  // Estimate "urban density" from turn density in the area
  // More turns in a small area = more buildings = worse GPS signal
  _precomputeUrbanDensity() {
    this.urbanDensity = new Array(this.routePoints.length).fill(0);
    const windowSize = 20; // look at ~20 points around each position
    for (let i = 0; i < this.routePoints.length; i++) {
      let turnSum = 0;
      let count = 0;
      for (let j = Math.max(0, i - windowSize); j < Math.min(this.routePoints.length, i + windowSize); j++) {
        if (this.turnAngles[j] > 15) {
          turnSum += this.turnAngles[j];
          count++;
        }
      }
      // Normalize: 0 = open road (few turns), 1 = dense urban (many sharp turns)
      this.urbanDensity[i] = Math.min(1.0, (count / windowSize) * (turnSum / (count || 1)) / 90);
    }
  }

  _calcTotalDistance() {
    let total = 0;
    for (let i = 0; i < this.routePoints.length - 1; i++) {
      total += this._haversine(
        this.routePoints[i].lat, this.routePoints[i].lng,
        this.routePoints[i + 1].lat, this.routePoints[i + 1].lng
      );
    }
    return total;
  }

  _getGradient() {
    if (this.elevations.length === 0 || this.currentIndex >= this.routePoints.length - 1) return 0;
    const idx = this.currentIndex;
    const nextIdx = Math.min(idx + 1, this.elevations.length - 1);
    const elev1 = this.elevations[idx] || 0;
    const elev2 = this.elevations[nextIdx] || 0;
    const dist = this._haversine(
      this.routePoints[idx].lat, this.routePoints[idx].lng,
      this.routePoints[nextIdx].lat, this.routePoints[nextIdx].lng
    );
    if (dist < 1) return 0;
    return ((elev2 - elev1) / dist) * 100;
  }

  _getCurrentAltitude() {
    if (this.elevations.length === 0) return 0;
    const idx = this.currentIndex;
    const nextIdx = Math.min(idx + 1, this.elevations.length - 1);
    const elev1 = this.elevations[idx] || 0;
    const elev2 = this.elevations[nextIdx] || 0;
    return elev1 + (elev2 - elev1) * this.progress;
  }

  _step(deltaMs) {
    // --- Handle auto-pause countdown ---
    if (this.isAutoPaused) {
      this.autoPauseRemaining -= deltaMs;
      if (this.autoPauseRemaining <= 0) {
        // End auto-pause
        this.isAutoPaused = false;
        this.autoPauseReason = '';
        this.broadcast({ type: 'auto-pause-end' });
      } else {
        // During pause: GPS still drifts! (real GPS behavior)
        const urban = this.urbanDensity[this.currentIndex] || 0;
        const drifted = this.jitter.apply(this.pausedLat, this.pausedLng, 0, urban, true);
        this.currentLat = drifted.lat;
        this.currentLng = drifted.lng;
        this._updateLocation(0, 0, true);
        return;
      }
    }

    // --- End of route check ---
    if (this.currentIndex >= this.routePoints.length - 1) {
      this.currentLap++;
      if (this.loopMode && this.currentLap < this.totalLaps) {
        this.currentIndex = 0;
        this.progress = 0;
        this.jitter.setLapSeed(this.currentLap);
        this.lastRestDistance = this.coveredDistance;
        this.nextRestDistance = this.coveredDistance + this.adv.restIntervalMin + Math.random() * (this.adv.restIntervalMax - this.adv.restIntervalMin);
        this.broadcast({ type: 'lap-complete', lap: this.currentLap, totalLaps: this.totalLaps });
        return;
      }
      this.stop();
      this.broadcast({ type: 'route-complete', laps: this.currentLap });
      return;
    }

    // --- Check for auto-pause triggers ---
    if (this.autoPauseEnabled && !this.isAutoPaused) {
      // 1. Intersection pause: sharp turn > 60°
      //    Only trigger if we haven't already paused at this segment
      const upcomingAngle = this.turnAngles[this.currentIndex + 1] || 0;
      if (upcomingAngle > 60 && this.progress > 0.8
          && this.currentIndex !== this.lastPausedAtIndex
          && Math.random() < this.adv.intersectionChance) {
        this.lastPausedAtIndex = this.currentIndex;
        const pauseDuration = this.adv.intersectionDurMin + Math.random() * (this.adv.intersectionDurMax - this.adv.intersectionDurMin);
        this._triggerAutoPause(pauseDuration, 'intersection');
        return;
      }

      // 2. Random rest stop
      if (this.coveredDistance >= this.nextRestDistance) {
        const restDuration = this.adv.restDurMin + Math.random() * (this.adv.restDurMax - this.adv.restDurMin);
        this._triggerAutoPause(restDuration, 'rest');
        this.nextRestDistance = this.coveredDistance + this.adv.restIntervalMin + Math.random() * (this.adv.restIntervalMax - this.adv.restIntervalMin);
        return;
      }
    }

    // --- Normal movement ---
    const turnAngle = this.turnAngles[this.currentIndex + 1] || 0;
    const gradient = this._getGradient();
    const naturalSpeed = this.speedEngine.getSpeed(deltaMs, {
      totalDuration: this.estimatedDuration,
      turnAngle: turnAngle,
      gradient: gradient
    });

    const from = this.routePoints[this.currentIndex];
    const to = this.routePoints[this.currentIndex + 1];
    const segmentDistance = this._haversine(from.lat, from.lng, to.lat, to.lng);

    const speedMs = (naturalSpeed * 1000) / 3600;
    const distanceCovered = speedMs * (deltaMs / 1000);
    this.coveredDistance += distanceCovered;

    if (segmentDistance < 0.01) { this.currentIndex++; return; }

    this.progress += distanceCovered / segmentDistance;

    if (this.progress >= 1) {
      this.progress = 0;
      this.currentIndex++;
      if (this.currentIndex >= this.routePoints.length - 1) {
        this.currentLat = to.lat;
        this.currentLng = to.lng;
        this.currentAlt = this._getCurrentAltitude();
        this._updateLocation(naturalSpeed, gradient, false);
        return;
      }
    }

    const currFrom = this.routePoints[this.currentIndex];
    const currTo = this.routePoints[this.currentIndex + 1];
    const baseLat = currFrom.lat + (currTo.lat - currFrom.lat) * this.progress;
    const baseLng = currFrom.lng + (currTo.lng - currFrom.lng) * this.progress;

    this.currentAlt = this._getCurrentAltitude();

    // GPS jitter with urban density
    const overallProgress = this.coveredDistance / this.totalDistance;
    const urban = this.urbanDensity[this.currentIndex] || 0;
    const jittered = this.jitter.apply(baseLat, baseLng, overallProgress, urban, false);
    this.currentLat = jittered.lat;
    this.currentLng = jittered.lng;

    this._updateLocation(naturalSpeed, gradient, false);
  }

  _triggerAutoPause(durationMs, reason) {
    this.isAutoPaused = true;
    this.autoPauseRemaining = durationMs;
    this.autoPauseReason = reason;
    this.pausedLat = this.currentLat;
    this.pausedLng = this.currentLng;
    this.broadcast({
      type: 'auto-pause-start',
      reason: reason,
      duration: Math.round(durationMs / 1000)
    });
  }

  _updateLocation(currentSpeed, gradient, isPaused) {
    this.connection.setLocation(this.currentLat, this.currentLng, Math.round(this.currentAlt)).catch(() => {});
    this.broadcast({
      type: 'position-update',
      lat: this.currentLat,
      lng: this.currentLng,
      altitude: Math.round(this.currentAlt),
      speed: Math.round(currentSpeed * 10) / 10,
      gradient: Math.round(gradient * 10) / 10,
      lap: this.currentLap + 1,
      totalLaps: this.totalLaps,
      distance: Math.round(this.coveredDistance),
      totalDistance: Math.round(this.totalDistance * (this.loopMode ? this.totalLaps : 1)),
      pointIndex: this.currentIndex,
      totalPoints: this.routePoints.length,
      isAutoPaused: isPaused,
      pauseReason: isPaused ? this.autoPauseReason : null,
      pauseRemaining: isPaused ? Math.round(this.autoPauseRemaining / 1000) : 0
    });
  }

  _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  setSpeed(speedKmh) {
    if (this.speedEngine) this.speedEngine.setBaseSpeed(speedKmh);
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  stop() {
    this.running = false;
    this.paused = false;
    this.isAutoPaused = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  getState() {
    return {
      running: this.running, paused: this.paused,
      speed: this.speedEngine ? this.speedEngine.currentSpeed : 0,
      pointIndex: this.currentIndex, totalPoints: this.routePoints.length,
      lat: this.currentLat, lng: this.currentLng, altitude: this.currentAlt,
      lap: this.currentLap + 1, totalLaps: this.totalLaps,
      distance: Math.round(this.coveredDistance),
      isAutoPaused: this.isAutoPaused,
      pauseReason: this.autoPauseReason
    };
  }
}

// ====================================================================
// WEBSOCKET HANDLER
// ====================================================================
const emulator = new EmulatorConnection();
let simulator = null;

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => { if (client.readyState === 1) client.send(msg); });
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.send(JSON.stringify({ type: 'status', ...emulator.getStatus() }));

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    try {
      switch (msg.type) {
        case 'connect': {
          const result = await emulator.connect(msg.host, msg.port);
          ws.send(JSON.stringify({ type: 'connect-result', ...result }));
          broadcast({ type: 'status', ...emulator.getStatus() });
          break;
        }
        case 'disconnect': {
          emulator.disconnect();
          if (simulator) simulator.stop();
          broadcast({ type: 'status', ...emulator.getStatus() });
          break;
        }
        case 'set-location': {
          const resp = await emulator.setLocation(msg.lat, msg.lng, msg.alt || 0);
          ws.send(JSON.stringify({ type: 'location-set', lat: msg.lat, lng: msg.lng, response: resp.trim() }));
          broadcast({ type: 'position-update', lat: msg.lat, lng: msg.lng });
          break;
        }
        case 'start-route': {
          if (simulator) simulator.stop();
          simulator = new RouteSimulator(emulator, broadcast);
          simulator.start(msg.routePoints, msg.speed, msg.elevations || [], {
            loop: msg.loop || false,
            laps: msg.laps || 1,
            jitter: msg.jitter !== false,
            jitterIntensity: msg.jitterIntensity || 1.0,
            jitterUrbanMult: msg.jitterUrbanMult ?? 0.5,
            autoPause: msg.autoPause !== false,
            advanced: msg.advanced || {}
          });
          ws.send(JSON.stringify({ type: 'route-started' }));
          break;
        }
        case 'pause-route': {
          if (simulator) simulator.pause();
          ws.send(JSON.stringify({ type: 'route-paused' }));
          break;
        }
        case 'resume-route': {
          if (simulator) simulator.resume();
          ws.send(JSON.stringify({ type: 'route-resumed' }));
          break;
        }
        case 'stop-route': {
          if (simulator) simulator.stop();
          ws.send(JSON.stringify({ type: 'route-stopped' }));
          break;
        }
        case 'set-speed': {
          if (simulator) simulator.setSpeed(msg.speed);
          break;
        }
        case 'get-status': {
          ws.send(JSON.stringify({
            type: 'status', ...emulator.getStatus(),
            simulator: simulator ? simulator.getState() : null
          }));
          break;
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => { console.log('Client disconnected'); });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🛰️  GPS Simulator running at http://localhost:${PORT}`);
});
