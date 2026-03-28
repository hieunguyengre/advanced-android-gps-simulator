// ===== GPS Simulator — Frontend App (Enhanced v2) =====

(function () {
  'use strict';

  let ws = null;
  let map = null;
  let currentMarker = null;
  let routePolyline = null;
  let previewPolyline = null;
  let waypointMarkers = [];
  let waypoints = [];
  let routePoints = [];
  let elevations = [];
  let mode = 'click';
  let isConnected = false;
  let isRouteRunning = false;
  let isRoutePaused = false;
  let currentProfile = 'custom';
  let randomCenter = null;
  let randomRadiusCircle = null;
  let randomCenterMarker = null;
  let searchPreviewPolylines = [];
  let searchSelectedRoute = null;
  let searchRadiusCircle = null;

  // ===== GPS Signal Quality Presets (research-based) =====
  // Real GPS deviation: Premium watch ~0.5m, Standard ~1.5m, Phone ~2-6m
  const GPS_QUALITY = {
    premium:    { name: 'Premium Watch',  intensity: 0.3,  urbanMult: 0.3 },
    standard:   { name: 'Standard Watch', intensity: 1.0,  urbanMult: 0.5 },
    phone_good: { name: 'Phone - Good',   intensity: 1.5,  urbanMult: 0.8 },
    phone_urban:{ name: 'Phone - Urban',  intensity: 2.5,  urbanMult: 1.5 },
    phone_poor: { name: 'Phone - Poor',   intensity: 4.0,  urbanMult: 2.0 }
  };

  // ===== Activity Profile Presets =====
  const PROFILES = {
    custom: { name: 'Custom' },
    walking: {
      name: 'Walking',
      speed: 5, jitter: true, gpsQuality: 'phone_good', autoPause: true,
      paceVar: 120, turnSlow: 20, gradientEff: 150,
      warmup: 60, cooldown: 60,
      intChance: 50, intDurMin: 15, intDurMax: 60,
      restIntMin: 1.5, restIntMax: 3, restDurMin: 45, restDurMax: 120
    },
    jogging: {
      name: 'Jogging',
      speed: 8, jitter: true, gpsQuality: 'standard', autoPause: true,
      paceVar: 100, turnSlow: 35, gradientEff: 120,
      warmup: 120, cooldown: 90,
      intChance: 30, intDurMin: 8, intDurMax: 30,
      restIntMin: 3, restIntMax: 6, restDurMin: 30, restDurMax: 75
    },
    running: {
      name: 'Running',
      speed: 12, jitter: true, gpsQuality: 'standard', autoPause: false,
      paceVar: 80, turnSlow: 45, gradientEff: 100,
      warmup: 180, cooldown: 120,
      intChance: 15, intDurMin: 5, intDurMax: 20,
      restIntMin: 5, restIntMax: 10, restDurMin: 20, restDurMax: 60
    },
    cycling: {
      name: 'Cycling',
      speed: 22, jitter: true, gpsQuality: 'premium', autoPause: true,
      paceVar: 70, turnSlow: 50, gradientEff: 150,
      warmup: 0, cooldown: 0,
      intChance: 60, intDurMin: 15, intDurMax: 60,
      restIntMin: 8, restIntMax: 15, restDurMin: 30, restDurMax: 90
    }
  };

  const $ = (id) => document.getElementById(id);
  const hostInput = $('hostInput');
  const portInput = $('portInput');
  const connectBtn = $('connectBtn');
  const statusDot = $('statusDot');
  const statusText = $('statusText');
  const latDisplay = $('latDisplay');
  const lngDisplay = $('lngDisplay');
  const currentSpeedDisplay = $('currentSpeedDisplay');
  const altitudeDisplay = $('altitudeDisplay');
  const distanceDisplay = $('distanceDisplay');
  const distanceUnit = $('distanceUnit');
  const gradientDisplay = $('gradientDisplay');
  const lapDisplay = $('lapDisplay');
  const lapCard = $('lapCard');
  const statsGrid = $('statsGrid');
  const modeClick = $('modeClick');
  const modeRoute = $('modeRoute');
  const routeControls = $('routeControls');
  const waypointCount = $('waypointCount');
  const routeDistance = $('routeDistance');
  const speedSlider = $('speedSlider');
  const speedValue = $('speedValue');
  const jitterToggle = $('jitterToggle');
  const jitterSlider = $('jitterSlider');
  const jitterValue = $('jitterValue');
  const gpsQualityContainer = $('gpsQualityContainer');
  const gpsQualitySelect = $('gpsQualitySelect');
  const gpsCustomIntensity = $('gpsCustomIntensity');
  const loopToggle = $('loopToggle');
  const loopLapsContainer = $('loopLapsContainer');
  const lapCount = $('lapCount');
  const startRouteBtn = $('startRouteBtn');
  const pauseRouteBtn = $('pauseRouteBtn');
  const stopRouteBtn = $('stopRouteBtn');
  const clearRouteBtn = $('clearRouteBtn');
  const loadingOverlay = $('loadingOverlay');
  const loadingText = $('loadingText');
  const autoPauseToggle = $('autoPauseToggle');
  const pauseCard = $('pauseCard');
  const pauseDisplay = $('pauseDisplay');
  const pauseUnit = $('pauseUnit');

  // Random run controls
  const randomRunControls = $('randomRunControls');
  const randomRadiusSlider = $('randomRadiusSlider');
  const randomRadiusValue = $('randomRadiusValue');
  const randomDistanceSlider = $('randomDistanceSlider');
  const randomDistanceValue = $('randomDistanceValue');
  const generateRandomBtn = $('generateRandomBtn');
  const clearRandomBtn = $('clearRandomBtn');

  // Search routes controls
  const searchRoutesControls = $('searchRoutesControls');
  const searchRadiusSlider = $('searchRadiusSlider');
  const searchRadiusValue = $('searchRadiusValue');
  const searchResultsContainer = $('searchResultsContainer');
  const searchResultsCount = $('searchResultsCount');
  const searchResultsList = $('searchResultsList');

  // Advanced settings refs
  const advancedToggle = $('advancedToggle');
  const advancedBody = $('advancedBody');
  const paceVarSlider = $('paceVarSlider');
  const paceVarVal = $('paceVarVal');
  const turnSlowSlider = $('turnSlowSlider');
  const turnSlowVal = $('turnSlowVal');
  const gradientEffSlider = $('gradientEffSlider');
  const gradientEffVal = $('gradientEffVal');
  const warmupSlider = $('warmupSlider');
  const warmupVal = $('warmupVal');
  const cooldownSlider = $('cooldownSlider');
  const cooldownVal = $('cooldownVal');
  const intChanceSlider = $('intChanceSlider');
  const intChanceVal = $('intChanceVal');
  const intDurMin = $('intDurMin');
  const intDurMax = $('intDurMax');
  const intDurVal = $('intDurVal');
  const restIntMin = $('restIntMin');
  const restIntMax = $('restIntMax');
  const restIntVal = $('restIntVal');
  const restDurMin = $('restDurMin');
  const restDurMax = $('restDurMax');
  const restDurVal = $('restDurVal');

  // ===== GPS Quality Helpers =====
  function getJitterIntensity() {
    const quality = gpsQualitySelect.value;
    if (quality === 'custom') {
      return parseInt(jitterSlider.value) / 10;
    }
    return GPS_QUALITY[quality]?.intensity ?? 1.0;
  }

  function getJitterUrbanMult() {
    const quality = gpsQualitySelect.value;
    if (quality === 'custom') {
      return 0.8; // default urban mult for custom mode
    }
    return GPS_QUALITY[quality]?.urbanMult ?? 0.5;
  }

  function initMap() {
    map = L.map('map', { center: [10.8231, 106.6297], zoom: 14, zoomControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd', maxZoom: 20
    }).addTo(map);
    map.on('click', onMapClick);
  }

  function onMapClick(e) {
    const { lat, lng } = e.latlng;
    if (mode === 'click') {
      if (!isConnected) { showToast('Connect to emulator first', 'error'); return; }
      sendWS({ type: 'set-location', lat, lng });
      updateMarker(lat, lng);
      updateCoords(lat, lng);
    } else if (mode === 'route') {
      addWaypoint(lat, lng);
    } else if (mode === 'random') {
      setRandomCenter(lat, lng);
    } else if (mode === 'search') {
      searchRoutes(lat, lng);
    }
  }

  // --- Random Run ---
  function setRandomCenter(lat, lng) {
    randomCenter = { lat, lng };

    // Draw/update center marker
    if (randomCenterMarker) {
      randomCenterMarker.setLatLng([lat, lng]);
    } else {
      randomCenterMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'random-center-marker',
          html: '<div class="random-center-pulse"></div><div class="random-center-dot">🎯</div>',
          iconSize: [32, 32], iconAnchor: [16, 16]
        }),
        zIndexOffset: 900
      }).addTo(map);
    }

    // Draw/update radius circle
    const radius = parseInt(randomRadiusSlider.value);
    if (randomRadiusCircle) {
      randomRadiusCircle.setLatLng([lat, lng]);
      randomRadiusCircle.setRadius(radius);
    } else {
      randomRadiusCircle = L.circle([lat, lng], {
        radius: radius,
        color: '#a78bfa',
        fillColor: '#a78bfa',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '8, 6'
      }).addTo(map);
    }

    generateRandomBtn.disabled = false;
    showToast(`Center set: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, 'info');
  }

  async function generateRandomRoute() {
    if (!randomCenter) {
      showToast('Click on the map to set a center point first', 'error');
      return;
    }

    const radius = parseInt(randomRadiusSlider.value);
    const distance = parseFloat(randomDistanceSlider.value);

    showLoading('Generating random route...');

    try {
      const resp = await fetch(
        `/api/random-route?lat=${randomCenter.lat}&lng=${randomCenter.lng}&radius=${radius}&distance=${distance}`
      );
      const data = await resp.json();

      if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
        showToast('Could not generate route. Try a different location or larger radius.', 'error');
        hideLoading();
        return;
      }

      const route = data.routes[0];
      const geojsonCoords = route.geometry.coordinates;
      routePoints = geojsonCoords.map(c => ({ lat: c[1], lng: c[0] }));

      // Clear existing waypoints
      waypoints = [routePoints[0], routePoints[routePoints.length - 1]];
      waypointMarkers.forEach(m => map.removeLayer(m));
      waypointMarkers = [];

      // Draw route
      const latlngs = routePoints.map(p => [p.lat, p.lng]);
      if (routePolyline) { routePolyline.setLatLngs(latlngs); }
      else {
        routePolyline = L.polyline(latlngs, {
          color: '#a78bfa', weight: 4, opacity: 0.85,
          smoothFactor: 1, lineCap: 'round', lineJoin: 'round'
        }).addTo(map);
      }

      // Add start marker
      const startMarker = L.circleMarker([routePoints[0].lat, routePoints[0].lng], {
        radius: 8, color: '#fff', fillColor: '#34d399', fillOpacity: 1, weight: 2
      }).addTo(map).bindPopup('<b>Start / Finish</b>');
      waypointMarkers.push(startMarker);

      const distKm = (route.distance / 1000).toFixed(2);
      routeDistance.textContent = `(${distKm} km)`;
      showToast(`Random route: ${distKm} km loop generated! 🎲`, 'success');

      // Fetch elevation
      await fetchElevations();

      // Fit map to route
      map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });

      // Show route controls for Start/Pause/Stop
      routeControls.classList.remove('hidden');

    } catch (err) {
      showToast('Route generation error: ' + err.message, 'error');
    }

    hideLoading();
    updateRouteUI();
  }

  function clearRandomRun() {
    randomCenter = null;
    if (randomCenterMarker) { map.removeLayer(randomCenterMarker); randomCenterMarker = null; }
    if (randomRadiusCircle) { map.removeLayer(randomRadiusCircle); randomRadiusCircle = null; }
    generateRandomBtn.disabled = true;
    clearRoute();
    routeControls.classList.add('hidden');
  }

  // --- Search Routes ---
  async function searchRoutes(lat, lng) {
    const radius = parseInt(searchRadiusSlider.value) * 1000; // km to meters
    showLoading('Searching for routes nearby...');

    // Show search area circle
    if (searchRadiusCircle) {
      searchRadiusCircle.setLatLng([lat, lng]);
      searchRadiusCircle.setRadius(radius);
    } else {
      searchRadiusCircle = L.circle([lat, lng], {
        radius: radius,
        color: '#f59e0b',
        fillColor: '#f59e0b',
        fillOpacity: 0.05,
        weight: 2,
        dashArray: '8, 6'
      }).addTo(map);
    }

    // Clear previous preview polylines
    clearSearchPreviews();

    try {
      const resp = await fetch(
        `/api/search-routes?lat=${lat}&lng=${lng}&radius=${radius}`
      );
      const data = await resp.json();

      if (data.error) {
        showToast('Search error: ' + data.error, 'error');
        hideLoading();
        return;
      }

      if (!data.routes || data.routes.length === 0) {
        showToast('No routes found in this area. Try a larger radius or different location.', 'info');
        searchResultsContainer.classList.add('hidden');
        hideLoading();
        return;
      }

      showToast(`Found ${data.routes.length} route(s)!`, 'success');
      renderSearchResults(data.routes);

    } catch (err) {
      showToast('Search error: ' + err.message, 'error');
    }

    hideLoading();
  }

  function renderSearchResults(routes) {
    searchResultsContainer.classList.remove('hidden');
    searchResultsCount.textContent = routes.length;
    searchResultsList.innerHTML = '';

    const typeIcons = {
      foot: '🚶', hiking: '🥾', running: '🏃', bicycle: '🚴'
    };
    const typeColors = {
      foot: '#34d399', hiking: '#f59e0b', running: '#f87171', bicycle: '#6387ff'
    };

    routes.forEach((route, index) => {
      const card = document.createElement('div');
      card.className = 'search-route-card';
      card.dataset.index = index;

      const icon = typeIcons[route.type] || '🗺️';
      const color = typeColors[route.type] || '#a78bfa';
      const distLabel = route.distance >= 1
        ? route.distance.toFixed(1) + ' km'
        : Math.round(route.distance * 1000) + ' m';
      const fromLabel = route.distFromCenter >= 1000
        ? (route.distFromCenter / 1000).toFixed(1) + ' km away'
        : route.distFromCenter + ' m away';
      const sourceLabel = route.source === 'waymarked' ? 'WMT' : 'OSM';
      const sourceColor = route.source === 'waymarked' ? '#818cf8' : '#60a5fa';

      card.innerHTML = `
        <div class="route-card-header">
          <span class="route-card-icon">${icon}</span>
          <div class="route-card-info">
            <div class="route-card-name">${route.name}</div>
            <div class="route-card-meta">
              <span class="route-card-badge" style="background:${color}20;color:${color}">${route.type}</span>
              <span class="route-card-badge" style="background:${sourceColor}20;color:${sourceColor}">${sourceLabel}</span>
              <span>${distLabel}</span>
              <span class="route-card-sep">•</span>
              <span>${fromLabel}</span>
            </div>
          </div>
        </div>
        <button class="btn btn-sm btn-use-route" data-idx="${index}">Use Route</button>
      `;

      // Hover preview
      card.addEventListener('mouseenter', () => {
        clearSearchPreviews();
        const latlngs = route.geometry.map(p => [p.lat, p.lng]);
        const previewLine = L.polyline(latlngs, {
          color: color, weight: 3, opacity: 0.6, dashArray: '6, 4'
        }).addTo(map);
        searchPreviewPolylines.push(previewLine);
        map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60] });
      });

      // Click "Use Route" button
      card.querySelector('.btn-use-route').addEventListener('click', (e) => {
        e.stopPropagation();
        selectSearchRoute(route);
      });

      searchResultsList.appendChild(card);
    });
  }

  function selectSearchRoute(route) {
    clearSearchPreviews();
    clearRoute();

    // Load route geometry
    routePoints = route.geometry;
    waypoints = [routePoints[0], routePoints[routePoints.length - 1]];

    // Draw route
    const latlngs = routePoints.map(p => [p.lat, p.lng]);
    const typeColors = {
      foot: '#34d399', hiking: '#f59e0b', running: '#f87171', bicycle: '#6387ff'
    };
    const color = typeColors[route.type] || '#a78bfa';

    if (routePolyline) { routePolyline.setLatLngs(latlngs); }
    else {
      routePolyline = L.polyline(latlngs, {
        color: color, weight: 4, opacity: 0.85,
        smoothFactor: 1, lineCap: 'round', lineJoin: 'round'
      }).addTo(map);
    }

    // Add start/end markers
    const startMarker = L.circleMarker([routePoints[0].lat, routePoints[0].lng], {
      radius: 8, color: '#fff', fillColor: '#34d399', fillOpacity: 1, weight: 2
    }).addTo(map).bindPopup('<b>Start</b>');
    const endMarker = L.circleMarker(
      [routePoints[routePoints.length - 1].lat, routePoints[routePoints.length - 1].lng],
      { radius: 8, color: '#fff', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }
    ).addTo(map).bindPopup('<b>End</b>');
    waypointMarkers.push(startMarker, endMarker);

    // Calculate distance
    let totalDist = 0;
    for (let i = 0; i < routePoints.length - 1; i++) {
      totalDist += haversine(routePoints[i].lat, routePoints[i].lng, routePoints[i + 1].lat, routePoints[i + 1].lng);
    }
    const distKm = (totalDist / 1000).toFixed(2);
    routeDistance.textContent = `(${distKm} km)`;

    showToast(`Selected: ${route.name} (${distKm} km)`, 'success');

    // Fetch elevation
    fetchElevations();

    // Fit map
    map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });

    // Show route controls
    routeControls.classList.remove('hidden');
    updateRouteUI();
  }

  function clearSearchPreviews() {
    searchPreviewPolylines.forEach(p => map.removeLayer(p));
    searchPreviewPolylines = [];
  }

  function clearSearchMode() {
    clearSearchPreviews();
    if (searchRadiusCircle) { map.removeLayer(searchRadiusCircle); searchRadiusCircle = null; }
    searchResultsContainer.classList.add('hidden');
    searchResultsList.innerHTML = '';
    clearRoute();
    routeControls.classList.add('hidden');
  }

  function createMarkerIcon() {
    return L.divIcon({
      className: 'current-position-marker',
      html: '<div class="marker-pulse"></div><div class="marker-dot"></div>',
      iconSize: [20, 20], iconAnchor: [10, 10]
    });
  }

  function updateMarker(lat, lng) {
    if (currentMarker) { currentMarker.setLatLng([lat, lng]); }
    else { currentMarker = L.marker([lat, lng], { icon: createMarkerIcon(), zIndexOffset: 1000 }).addTo(map); }
  }

  function updateCoords(lat, lng) {
    latDisplay.textContent = lat.toFixed(6);
    lngDisplay.textContent = lng.toFixed(6);
  }

  // --- Waypoint Management ---
  function addWaypoint(lat, lng) {
    waypoints.push({ lat, lng });
    const idx = waypoints.length;
    const marker = L.circleMarker([lat, lng], {
      radius: 8, color: '#fff', fillColor: '#6387ff', fillOpacity: 1, weight: 2
    }).addTo(map);
    marker.bindPopup(`<b>Waypoint ${idx}</b><br>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    waypointMarkers.push(marker);
    updatePreviewPolyline();
    if (waypoints.length >= 2) fetchRoadRoute();
    updateRouteUI();
  }

  function updatePreviewPolyline() {
    const latlngs = waypoints.map(w => [w.lat, w.lng]);
    if (previewPolyline) { previewPolyline.setLatLngs(latlngs); }
    else {
      previewPolyline = L.polyline(latlngs, {
        color: '#6387ff', weight: 2, opacity: 0.4, dashArray: '6, 8', smoothFactor: 1
      }).addTo(map);
    }
  }

  // --- OSRM Road Route + Elevation ---
  async function fetchRoadRoute() {
    if (waypoints.length < 2) return;
    showLoading('Finding road route...');

    try {
      const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
      const resp = await fetch(`/api/route?coordinates=${encodeURIComponent(coords)}`);
      const data = await resp.json();

      if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
        showToast('Could not find road route. Try different points.', 'error');
        hideLoading();
        return;
      }

      const route = data.routes[0];
      const geojsonCoords = route.geometry.coordinates;
      routePoints = geojsonCoords.map(c => ({ lat: c[1], lng: c[0] }));

      // Draw road route
      const latlngs = routePoints.map(p => [p.lat, p.lng]);
      if (routePolyline) { routePolyline.setLatLngs(latlngs); }
      else {
        routePolyline = L.polyline(latlngs, {
          color: '#34d399', weight: 4, opacity: 0.85, smoothFactor: 1, lineCap: 'round', lineJoin: 'round'
        }).addTo(map);
      }

      const distKm = (route.distance / 1000).toFixed(2);
      routeDistance.textContent = `(${distKm} km)`;
      showToast(`Route found: ${distKm} km`, 'success');

      // Fetch elevation data
      await fetchElevations();

    } catch (err) {
      showToast('Route API error: ' + err.message, 'error');
    }

    hideLoading();
    updateRouteUI();
  }

  async function fetchElevations() {
    if (routePoints.length === 0) return;

    showLoading('Fetching elevation data...');

    // Open-Meteo supports up to ~100 coordinates per request
    // Sample route points if too many
    const maxPoints = 100;
    let sampleIndices = [];

    if (routePoints.length <= maxPoints) {
      sampleIndices = routePoints.map((_, i) => i);
    } else {
      // Sample evenly
      for (let i = 0; i < maxPoints; i++) {
        sampleIndices.push(Math.round(i * (routePoints.length - 1) / (maxPoints - 1)));
      }
    }

    const sampleLats = sampleIndices.map(i => routePoints[i].lat.toFixed(4)).join(',');
    const sampleLngs = sampleIndices.map(i => routePoints[i].lng.toFixed(4)).join(',');

    try {
      const resp = await fetch(`/api/elevation?lats=${encodeURIComponent(sampleLats)}&lngs=${encodeURIComponent(sampleLngs)}`);
      const data = await resp.json();

      if (data.elevation && data.elevation.length > 0) {
        // Interpolate elevations for all route points
        elevations = new Array(routePoints.length).fill(0);
        for (let i = 0; i < sampleIndices.length; i++) {
          elevations[sampleIndices[i]] = data.elevation[i] || 0;
        }

        // Linear interpolation for points between samples
        for (let i = 0; i < sampleIndices.length - 1; i++) {
          const startIdx = sampleIndices[i];
          const endIdx = sampleIndices[i + 1];
          const startElev = elevations[startIdx];
          const endElev = elevations[endIdx];
          for (let j = startIdx + 1; j < endIdx; j++) {
            const t = (j - startIdx) / (endIdx - startIdx);
            elevations[j] = startElev + (endElev - startElev) * t;
          }
        }

        const minElev = Math.min(...data.elevation);
        const maxElev = Math.max(...data.elevation);
        showToast(`Elevation loaded: ${minElev}–${maxElev}m`, 'success');
      }
    } catch (err) {
      showToast('Elevation API error (continuing without): ' + err.message, 'error');
      elevations = [];
    }
    hideLoading();
  }

  function clearRoute() {
    waypoints = [];
    routePoints = [];
    elevations = [];
    waypointMarkers.forEach(m => map.removeLayer(m));
    waypointMarkers = [];
    if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
    if (previewPolyline) { map.removeLayer(previewPolyline); previewPolyline = null; }
    routeDistance.textContent = '';
    statsGrid.style.display = 'none';
    updateRouteUI();
  }

  // ===== GPX File Parser =====
  function parseGPX(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const points = [];
    const gpxElevations = [];
    let hasElevation = false;

    // Try <trk><trkseg><trkpt> first (track format — most common)
    let trkpts = doc.querySelectorAll('trkpt');
    if (trkpts.length === 0) {
      // Try <rte><rtept> (route format)
      trkpts = doc.querySelectorAll('rtept');
    }
    if (trkpts.length === 0) {
      // Try <wpt> (waypoint format)
      trkpts = doc.querySelectorAll('wpt');
    }

    trkpts.forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lng = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({ lat, lng });
        const ele = pt.querySelector('ele');
        if (ele && ele.textContent) {
          gpxElevations.push(parseFloat(ele.textContent));
          hasElevation = true;
        } else {
          gpxElevations.push(0);
        }
      }
    });

    return { points, elevations: hasElevation ? gpxElevations : null };
  }

  async function importGPXFile(file) {
    showLoading('Parsing GPX file...');
    try {
      const text = await file.text();
      const gpx = parseGPX(text);

      if (gpx.points.length < 2) {
        showToast('GPX file has less than 2 points', 'error');
        hideLoading();
        return;
      }

      // Clear existing route
      clearRoute();

      // Use GPX points directly as route (no OSRM — they are already a real path)
      routePoints = gpx.points;

      // Add start + end as waypoints for display
      waypoints = [
        gpx.points[0],
        gpx.points[gpx.points.length - 1]
      ];

      // Draw on map
      const latlngs = routePoints.map(p => [p.lat, p.lng]);
      if (routePolyline) { routePolyline.setLatLngs(latlngs); }
      else {
        routePolyline = L.polyline(latlngs, {
          color: '#f59e0b', weight: 4, opacity: 0.85, smoothFactor: 1, lineCap: 'round', lineJoin: 'round'
        }).addTo(map);
      }

      // Add markers for start/end
      const startMarker = L.circleMarker([gpx.points[0].lat, gpx.points[0].lng], {
        radius: 8, color: '#fff', fillColor: '#34d399', fillOpacity: 1, weight: 2
      }).addTo(map).bindPopup('<b>Start</b>');
      const endMarker = L.circleMarker([gpx.points[gpx.points.length - 1].lat, gpx.points[gpx.points.length - 1].lng], {
        radius: 8, color: '#fff', fillColor: '#ef4444', fillOpacity: 1, weight: 2
      }).addTo(map).bindPopup('<b>End</b>');
      waypointMarkers.push(startMarker, endMarker);

      // Calculate distance
      let totalDist = 0;
      for (let i = 0; i < routePoints.length - 1; i++) {
        totalDist += haversine(routePoints[i].lat, routePoints[i].lng, routePoints[i + 1].lat, routePoints[i + 1].lng);
      }
      const distKm = (totalDist / 1000).toFixed(2);
      routeDistance.textContent = `(${distKm} km)`;

      // Elevation: use GPX data if available, else fetch from API
      if (gpx.elevations) {
        elevations = gpx.elevations;
        showToast(`GPX imported: ${gpx.points.length} points, ${distKm} km (with elevation)`, 'success');
      } else {
        await fetchElevations();
        showToast(`GPX imported: ${gpx.points.length} points, ${distKm} km`, 'success');
      }

      // Fit map to route
      map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });

      // Switch to route mode and show controls
      mode = 'route';
      $('modeRoute').classList.add('active');
      $('modeClick').classList.remove('active');
      $('modeImport').classList.remove('active');
      routeControls.classList.remove('hidden');

    } catch (err) {
      showToast('GPX parse error: ' + err.message, 'error');
    }
    hideLoading();
    updateRouteUI();
  }

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ===== Activity Profile Application =====
  function applyProfile(profileId) {
    currentProfile = profileId;
    document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-profile="${profileId}"]`);
    if (btn) btn.classList.add('active');

    if (profileId === 'custom') return; // don't change any values

    const p = PROFILES[profileId];
    if (!p) return;

    // Set main controls
    speedSlider.value = p.speed;
    speedValue.textContent = p.speed;
    updateSliderBg(speedSlider, 1, 60);

    jitterToggle.checked = p.jitter;
    if (p.gpsQuality) {
      gpsQualitySelect.value = p.gpsQuality;
      gpsCustomIntensity.classList.add('hidden');
    }
    gpsQualityContainer.style.opacity = p.jitter ? '1' : '0.3';

    autoPauseToggle.checked = p.autoPause;

    // Advanced settings
    paceVarSlider.value = p.paceVar; paceVarVal.textContent = p.paceVar + '%';
    updateSliderBg(paceVarSlider, 0, 200);
    turnSlowSlider.value = p.turnSlow; turnSlowVal.textContent = p.turnSlow + '%';
    updateSliderBg(turnSlowSlider, 0, 60);
    gradientEffSlider.value = p.gradientEff; gradientEffVal.textContent = p.gradientEff + '%';
    updateSliderBg(gradientEffSlider, 0, 200);
    warmupSlider.value = p.warmup; warmupVal.textContent = p.warmup === 0 ? 'Auto' : p.warmup + 's';
    updateSliderBg(warmupSlider, 0, 300);
    cooldownSlider.value = p.cooldown; cooldownVal.textContent = p.cooldown === 0 ? 'Auto' : p.cooldown + 's';
    updateSliderBg(cooldownSlider, 0, 300);
    intChanceSlider.value = p.intChance; intChanceVal.textContent = p.intChance + '%';
    updateSliderBg(intChanceSlider, 0, 100);
    intDurMin.value = p.intDurMin; intDurMax.value = p.intDurMax;
    intDurVal.textContent = `${p.intDurMin}-${p.intDurMax}s`;
    restIntMin.value = p.restIntMin; restIntMax.value = p.restIntMax;
    restIntVal.textContent = `${p.restIntMin}-${p.restIntMax} km`;
    restDurMin.value = p.restDurMin; restDurMax.value = p.restDurMax;
    restDurVal.textContent = `${p.restDurMin}-${p.restDurMax}s`;

    showToast(`Profile: ${p.name} applied`, 'info');
  }

  function updateRouteUI() {
    waypointCount.textContent = waypoints.length;
    startRouteBtn.disabled = routePoints.length < 2 || !isConnected || isRouteRunning;
  }

  // --- Loading Overlay ---
  function showLoading(text) {
    loadingText.textContent = text || 'Loading...';
    loadingOverlay.classList.remove('hidden');
  }
  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  // --- WebSocket ---
  function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);
    ws.onopen = () => showToast('Connected to server', 'success');
    ws.onmessage = (event) => handleMessage(JSON.parse(event.data));
    ws.onclose = () => { showToast('Server connection lost. Reconnecting...', 'error'); setTimeout(connectWS, 3000); };
    ws.onerror = () => {};
  }

  function sendWS(data) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  // --- Message Handler ---
  function handleMessage(msg) {
    switch (msg.type) {
      case 'status':
        updateConnectionStatus(msg.connected, msg.authenticated);
        break;
      case 'connect-result':
        showToast(msg.message, msg.success ? 'success' : 'error');
        break;
      case 'location-set':
        showToast(`GPS → ${msg.lat.toFixed(5)}, ${msg.lng.toFixed(5)}`, 'success');
        break;
      case 'position-update':
        updateMarker(msg.lat, msg.lng);
        updateCoords(msg.lat, msg.lng);

        if (msg.speed !== undefined) {
          statsGrid.style.display = 'grid';
          currentSpeedDisplay.textContent = msg.speed.toFixed(1);
          altitudeDisplay.textContent = msg.altitude || 0;
          gradientDisplay.textContent = (msg.gradient >= 0 ? '+' : '') + msg.gradient;

          if (msg.distance >= 1000) {
            distanceDisplay.textContent = (msg.distance / 1000).toFixed(2);
            distanceUnit.textContent = 'km';
          } else {
            distanceDisplay.textContent = msg.distance;
            distanceUnit.textContent = 'm';
          }

          if (msg.totalLaps > 1) {
            lapCard.style.display = 'flex';
            lapDisplay.textContent = `${msg.lap}/${msg.totalLaps}`;
          }

          // Auto-pause indicator
          if (msg.isAutoPaused) {
            pauseCard.style.display = 'flex';
            const reason = msg.pauseReason === 'intersection' ? '🚦' : '😮‍💨';
            pauseDisplay.textContent = reason + ' ' + msg.pauseRemaining;
            pauseUnit.textContent = 's';
          } else {
            pauseCard.style.display = 'none';
          }
        }
        break;
      case 'auto-pause-start': {
        const reasonText = msg.reason === 'intersection'
          ? `🚦 Intersection pause (${msg.duration}s)`
          : `😮‍💨 Rest stop (${msg.duration}s)`;
        showToast(reasonText, 'info');
        break;
      }
      case 'auto-pause-end':
        showToast('Resuming movement...', 'info');
        pauseCard.style.display = 'none';
        break;
      case 'lap-complete':
        showToast(`Lap ${msg.lap} done! Starting lap ${msg.lap + 1}...`, 'info');
        break;
      case 'route-started':
        isRouteRunning = true; isRoutePaused = false;
        updateRouteButtons();
        showToast('Route simulation started 🏃', 'info');
        break;
      case 'route-paused':
        isRoutePaused = true; updateRouteButtons();
        break;
      case 'route-resumed':
        isRoutePaused = false; updateRouteButtons();
        break;
      case 'route-stopped':
        isRouteRunning = false; isRoutePaused = false;
        updateRouteButtons();
        showToast('Route simulation stopped', 'info');
        break;
      case 'route-complete':
        isRouteRunning = false; isRoutePaused = false;
        updateRouteButtons();
        showToast(`Route completed${msg.laps > 1 ? ` (${msg.laps} laps)` : ''}! 🎉`, 'success');
        break;
      case 'error':
        showToast(msg.message, 'error');
        break;
    }
  }

  function updateConnectionStatus(connected, authenticated) {
    isConnected = connected;
    if (connected) {
      statusDot.classList.add('connected');
      statusText.textContent = authenticated ? 'Connected & Authenticated' : 'Connected (not authenticated)';
      statusText.style.color = 'var(--success)';
      connectBtn.querySelector('.btn-text').textContent = 'Disconnect';
      connectBtn.classList.add('connected');
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Disconnected';
      statusText.style.color = 'var(--text-muted)';
      connectBtn.querySelector('.btn-text').textContent = 'Connect';
      connectBtn.classList.remove('connected');
    }
    updateRouteUI();
  }

  function updateRouteButtons() {
    startRouteBtn.disabled = isRouteRunning || routePoints.length < 2 || !isConnected;
    pauseRouteBtn.disabled = !isRouteRunning;
    stopRouteBtn.disabled = !isRouteRunning;
    pauseRouteBtn.innerHTML = isRoutePaused
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg> Resume'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
  }

  function showToast(message, type = 'info') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span style="font-weight:700;">${icons[type] || 'ℹ'}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastOut 0.3s forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function updateSliderBg(slider, min, max) {
    const pct = ((parseInt(slider.value) - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--bg-input) ${pct}%)`;
  }

  function bindEvents() {
    connectBtn.addEventListener('click', () => {
      if (isConnected) { sendWS({ type: 'disconnect' }); }
      else {
        sendWS({ type: 'connect', host: hostInput.value || 'localhost', port: parseInt(portInput.value) || 5554 });
        statusText.textContent = 'Connecting...';
        statusText.style.color = 'var(--warning)';
      }
    });

    function deactivateAllModes() {
      modeClick.classList.remove('active');
      modeRoute.classList.remove('active');
      $('modeImport').classList.remove('active');
      $('modeRandom').classList.remove('active');
      $('modeSearch').classList.remove('active');
      routeControls.classList.add('hidden');
      randomRunControls.classList.add('hidden');
      searchRoutesControls.classList.add('hidden');
      map.getContainer().style.cursor = '';
    }

    modeClick.addEventListener('click', () => {
      deactivateAllModes();
      mode = 'click';
      modeClick.classList.add('active');
    });

    modeRoute.addEventListener('click', () => {
      deactivateAllModes();
      mode = 'route';
      modeRoute.classList.add('active');
      routeControls.classList.remove('hidden');
      map.getContainer().style.cursor = 'crosshair';
    });

    // GPX Import
    const gpxFileInput = $('gpxFileInput');
    $('modeImport').addEventListener('click', () => {
      gpxFileInput.click();
    });
    gpxFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        importGPXFile(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Random Run mode
    $('modeRandom').addEventListener('click', () => {
      deactivateAllModes();
      mode = 'random';
      $('modeRandom').classList.add('active');
      randomRunControls.classList.remove('hidden');
      map.getContainer().style.cursor = 'crosshair';
    });

    // Random run controls
    randomRadiusSlider.addEventListener('input', () => {
      randomRadiusValue.textContent = randomRadiusSlider.value;
      updateSliderBg(randomRadiusSlider, 200, 2000);
      if (randomRadiusCircle && randomCenter) {
        randomRadiusCircle.setRadius(parseInt(randomRadiusSlider.value));
      }
    });
    updateSliderBg(randomRadiusSlider, 200, 2000);

    randomDistanceSlider.addEventListener('input', () => {
      randomDistanceValue.textContent = randomDistanceSlider.value;
      updateSliderBg(randomDistanceSlider, 1, 10);
    });
    updateSliderBg(randomDistanceSlider, 1, 10);

    generateRandomBtn.addEventListener('click', () => generateRandomRoute());
    clearRandomBtn.addEventListener('click', () => clearRandomRun());

    // Search mode
    $('modeSearch').addEventListener('click', () => {
      deactivateAllModes();
      mode = 'search';
      $('modeSearch').classList.add('active');
      searchRoutesControls.classList.remove('hidden');
      map.getContainer().style.cursor = 'crosshair';
    });

    searchRadiusSlider.addEventListener('input', () => {
      searchRadiusValue.textContent = searchRadiusSlider.value;
      updateSliderBg(searchRadiusSlider, 1, 20);
      if (searchRadiusCircle) {
        searchRadiusCircle.setRadius(parseInt(searchRadiusSlider.value) * 1000);
      }
    });
    updateSliderBg(searchRadiusSlider, 1, 20);

    // Activity Profile buttons
    document.querySelectorAll('.profile-btn').forEach(btn => {
      btn.addEventListener('click', () => applyProfile(btn.dataset.profile));
    });

    speedSlider.addEventListener('input', () => {
      speedValue.textContent = speedSlider.value;
      updateSliderBg(speedSlider, 1, 60);
      if (isRouteRunning) sendWS({ type: 'set-speed', speed: parseInt(speedSlider.value) });
    });

    jitterToggle.addEventListener('change', () => {
      gpsQualityContainer.style.opacity = jitterToggle.checked ? '1' : '0.3';
      gpsQualityContainer.style.pointerEvents = jitterToggle.checked ? 'auto' : 'none';
      gpsCustomIntensity.style.opacity = jitterToggle.checked ? '1' : '0.3';
      gpsCustomIntensity.style.pointerEvents = jitterToggle.checked ? 'auto' : 'none';
    });

    gpsQualitySelect.addEventListener('change', () => {
      if (gpsQualitySelect.value === 'custom') {
        gpsCustomIntensity.classList.remove('hidden');
      } else {
        gpsCustomIntensity.classList.add('hidden');
      }
    });

    jitterSlider.addEventListener('input', () => {
      jitterValue.textContent = (parseInt(jitterSlider.value) / 10).toFixed(1) + '×';
      updateSliderBg(jitterSlider, 1, 50);
    });

    loopToggle.addEventListener('change', () => {
      loopLapsContainer.classList.toggle('hidden', !loopToggle.checked);
    });

    startRouteBtn.addEventListener('click', () => {
      if (routePoints.length < 2) { showToast('Need a valid route', 'error'); return; }
      sendWS({
        type: 'start-route',
        routePoints,
        elevations,
        speed: parseInt(speedSlider.value),
        jitter: jitterToggle.checked,
        jitterIntensity: getJitterIntensity(),
        jitterUrbanMult: getJitterUrbanMult(),
        loop: loopToggle.checked,
        laps: loopToggle.checked ? parseInt(lapCount.value) || 3 : 1,
        autoPause: autoPauseToggle.checked,
        advanced: {
          paceVariation: parseInt(paceVarSlider.value) / 100,
          turnSlowdown: parseInt(turnSlowSlider.value) / 100,
          gradientEffect: parseInt(gradientEffSlider.value) / 100,
          warmupDuration: parseInt(warmupSlider.value) || 0,
          cooldownDuration: parseInt(cooldownSlider.value) || 0,
          intersectionChance: parseInt(intChanceSlider.value) / 100,
          intersectionDurMin: parseFloat(intDurMin.value) * 1000,
          intersectionDurMax: parseFloat(intDurMax.value) * 1000,
          restIntervalMin: parseFloat(restIntMin.value) * 1000,
          restIntervalMax: parseFloat(restIntMax.value) * 1000,
          restDurMin: parseFloat(restDurMin.value) * 1000,
          restDurMax: parseFloat(restDurMax.value) * 1000
        }
      });
    });

    pauseRouteBtn.addEventListener('click', () => { sendWS({ type: isRoutePaused ? 'resume-route' : 'pause-route' }); });
    stopRouteBtn.addEventListener('click', () => { sendWS({ type: 'stop-route' }); });

    clearRouteBtn.addEventListener('click', () => {
      if (isRouteRunning) sendWS({ type: 'stop-route' });
      clearRoute();
    });

    $('toggleConnection').addEventListener('click', () => {
      const body = $('connectionBody');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });

    // Advanced settings toggle
    advancedToggle.addEventListener('click', () => {
      advancedBody.classList.toggle('hidden');
      advancedToggle.classList.toggle('open');
    });

    // Advanced sliders
    const bindSlider = (slider, display, min, max, fmt) => {
      slider.addEventListener('input', () => {
        display.textContent = fmt(slider.value);
        updateSliderBg(slider, min, max);
      });
      updateSliderBg(slider, min, max);
    };

    bindSlider(paceVarSlider, paceVarVal, 0, 200, v => v + '%');
    bindSlider(turnSlowSlider, turnSlowVal, 0, 60, v => v + '%');
    bindSlider(gradientEffSlider, gradientEffVal, 0, 200, v => v + '%');
    bindSlider(warmupSlider, warmupVal, 0, 300, v => v == 0 ? 'Auto' : v + 's');
    bindSlider(cooldownSlider, cooldownVal, 0, 300, v => v == 0 ? 'Auto' : v + 's');
    bindSlider(intChanceSlider, intChanceVal, 0, 100, v => v + '%');

    // Dual-range input handlers
    const bindDual = (minEl, maxEl, display, unit) => {
      const update = () => { display.textContent = `${minEl.value}-${maxEl.value}${unit}`; };
      minEl.addEventListener('input', update);
      maxEl.addEventListener('input', update);
    };
    bindDual(intDurMin, intDurMax, intDurVal, 's');
    bindDual(restIntMin, restIntMax, restIntVal, ' km');
    bindDual(restDurMin, restDurMax, restDurVal, 's');
    updateSliderBg(speedSlider, 1, 60);
    updateSliderBg(jitterSlider, 1, 50);
  }

  function init() { initMap(); bindEvents(); connectWS(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
