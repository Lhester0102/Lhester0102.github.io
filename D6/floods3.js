let model, minVals = [], maxVals = [], confChart, rocChart;
let geocoder;
let lastConfData = [], lastRocPoints = [], lastAUC = 0;
let parsedCsvFeatures = [], parsedCsvLabels = [];

let stationMarkersArray = [];
let rivers = []; 

// Group risk layer IDs by risk category
let riskLayers = {
  severe: [],
  high: [],
  moderate: [],
  low: []
};

let currentFirebaseTimestamp = "";

window.onload = async function() {
  updateKPIs();
  await loadModel(); 
  await populateRiverData();
}

function updateKPIs() {
  const waterInput = document.getElementById("waterLevel");
  const rainInput = document.getElementById("rainfall");
  const dischargeInput = document.getElementById("discharge");
  
  if (waterInput) {
    document.getElementById("kpiWater").innerHTML = `
      ${waterInput.value} m
      ${currentFirebaseTimestamp ? `
      <div class="text-muted small" style="font-size: 0.75rem; font-weight: normal; margin-top: 4px;">
        <i class="bi bi-clock"></i> ${currentFirebaseTimestamp}
      </div>` : ''}
    `;
  }
  if (rainInput) document.getElementById("kpiRain").innerHTML = rainInput.value;
  if (dischargeInput) document.getElementById("kpiDischarge").innerHTML = dischargeInput.value;
}

const firebaseConfig = {
  apiKey: "AIzaSyBcayr5NOjbrAuLn7bkUovRWVyG4O9wMPk",
  authDomain: "flooded-95eeb.firebaseapp.com",
  projectId: "flooded-95eeb",
  storageBucket: "flooded-95eeb.firebasestorage.app",
  messagingSenderId: "142547476223",
  appId: "1:142547476223:web:70de7014c664e26d0636ca"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storageRef = firebase.storage().ref();

let currentMunicipality = null;
let currentDataListener = null;

function detachCurrentDataListener() {
  if (currentDataListener && currentDataListener.off) {
    currentDataListener.off('value');
  }
  currentDataListener = null;
}

function processMunicipalitySnapshot(snapshot, sourceName) {
  if (!snapshot.exists()) {
    if (sourceName === 'data2') {
      loadData2JsonFallback();
    } else {
      document.getElementById('status').innerHTML = `${sourceName} has no latest value yet.`;
    }
    return;
  }
  snapshot.forEach(child => {
    const v = child.val();
    const level = v.level ?? v.water ?? v.water_level ?? null;
    const rain = v.rain ?? v.rainfall ?? null;
    const flow = v.flow ?? v.discharge ?? null;
    
    const dbDate = v.dt ?? v.date ?? "";
    const dbTime = v.t ?? v.time ?? "";
    currentFirebaseTimestamp = (dbDate && dbTime) ? `${dbDate} | ${dbTime}` : (dbDate || dbTime || "");
    
    setSensorInputs(level, rain, flow);
  });
  document.getElementById('status').innerHTML = `${sourceName} updated — auto refreshed.`;
  manualPredict();
}

async function loadData2JsonFallback() {
  try {
    const url = await storageRef.child('data2.json').getDownloadURL();
    const resp = await fetch(url);
    const payload = await resp.json();
    let level = payload.level ?? payload.water ?? payload.water_level ?? null;
    let rain = payload.rain ?? payload.rainfall ?? null;
    let flow = payload.flow ?? payload.discharge ?? null;
    
    let dbDate = payload.dt ?? payload.date ?? "";
    let dbTime = payload.t ?? payload.time ?? "";
    
    if ((level === null && rain === null && flow === null) && payload.features && payload.features[0] && payload.features[0].properties) {
      const p = payload.features[0].properties;
      level = level ?? p.level ?? p.water ?? p.water_level ?? null;
      rain = rain ?? p.rain ?? p.rainfall ?? null;
      flow = flow ?? p.flow ?? p.discharge ?? null;
      dbDate = dbDate ?? p.dt ?? p.date ?? "";
      dbTime = dbTime ?? p.t ?? p.time ?? "";
    }
    
    currentFirebaseTimestamp = (dbDate && dbTime) ? `${dbDate} | ${dbTime}` : (dbDate || dbTime || "");
    setSensorInputs(level, rain, flow);
    document.getElementById('status').innerHTML = 'data2.json fallback loaded.';
    await manualPredict();
  } catch (err) {
    console.error('Failed to load data2.json fallback:', err);
  }
}

function subscribeToMunicipalityData(municipality) {
  if (!municipality) return;
  if (currentMunicipality === municipality) return;
  detachCurrentDataListener();
  currentMunicipality = municipality;
  if (municipality === 'Laoag') {
    const ref = db.ref('data2').orderByKey().limitToLast(1);
    currentDataListener = ref;
    ref.on('value', snapshot => processMunicipalitySnapshot(snapshot, 'data2'));
    document.getElementById('status').innerHTML = 'Subscribed to latest Laoag data updates.';
  } else if (municipality === 'Pasuquin') {
    const ref = db.ref('data').orderByKey().limitToLast(1);
    currentDataListener = ref;
    ref.on('value', snapshot => processMunicipalitySnapshot(snapshot, 'data'));
    document.getElementById('status').innerHTML = 'Subscribed to latest Pasuquin data updates.';
  } else if (municipality === 'Bacarra') {
    const ref = db.ref('data3').orderByKey().limitToLast(1);
    currentDataListener = ref;
    ref.on('value', snapshot => processMunicipalitySnapshot(snapshot, 'data3'));
    document.getElementById('status').innerHTML = 'Subscribed to latest Bacarra data updates.';
  }
}

function setSensorInputs(level, rain, flow) {
  if (typeof level !== 'undefined' && level !== null) {
    const input = document.getElementById('waterLevel');
    if (input) input.value = level;
    updateKPIs();
  }
  if (typeof rain !== 'undefined' && rain !== null) {
    const input = document.getElementById('rainfall');
    if (input) input.value = rain;
    const kpi = document.getElementById('kpiRain');
    if (kpi) kpi.innerHTML = parseFloat(rain).toFixed(2);
  }
  if (typeof flow !== 'undefined' && flow !== null) {
    const input = document.getElementById('discharge');
    if (input) input.value = flow;
    const kpi = document.getElementById('kpiDischarge');
    if (kpi) kpi.innerHTML = parseFloat(flow).toFixed(2);
  }
}

mapboxgl.accessToken = 'pk.eyJ1IjoibGhlc3RlcjA4IiwiYSI6ImNtaHFmc3BncjBwZGQybHM0NWN3ejNoNnIifQ.2kEE1OBDTgpnse5-F8QGeg';
if ('telemetry' in mapboxgl) {
  mapboxgl.telemetry = false;
}

const initialCenter = [120.5927871, 18.1959782];

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/lhester08/cmhqgzq0r004601su4m8i8ov1',
  center: initialCenter,
  zoom: 11,
  pitch: 60
});

function getFloodMarkerColor(probabilityValue) {
  if (probabilityValue >= 70) return '#dc3545';     // Red (Severe Risk)
  if (probabilityValue >= 30) return '#fd7e14';     // Orange (Moderate Risk)
  return '#198754';                                 // Green (Low Risk)
}

function getFloodColor(vulnerability) {
  const val = parseFloat(vulnerability) || 0;
  if (val >= 80 || vulnerability === 'severe') return 'rgba(255, 0, 0, 1)';     
  if (val >= 50 || vulnerability === 'high') return 'rgba(253, 155, 0, 1)';    
  if (val >= 20 || vulnerability === 'moderate') return 'rgba(255, 230, 0, 1)';     
  return 'rgba(144, 238, 144, .2)';                           
}

function getRiskCategory(val) {
  if (typeof val === 'string') {
    const strVal = val.toLowerCase().trim();
    if (['severe', 'high', 'moderate', 'low'].includes(strVal)) return strVal;
  }
  const num = parseFloat(val) || 0;
  if (num >= 80) return 'severe';
  if (num >= 50) return 'high';
  if (num >= 20) return 'moderate';
  return 'low';
}

let activeMarker = null;

async function getElevationFromCoords(lng, lat) {
  const token = mapboxgl.accessToken;
  const zoom = 15; 
  const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom));
  
  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${zoom}/${x}/${y}.pngraw?access_token=${token}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Terrain tile request failed.");
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 256;
    ctx.drawImage(bitmap, 0, 0);
    
    const pixelX = Math.floor(((lng + 180) / 360 * Math.pow(2, zoom) - x) * 256);
    const latMerc = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const pixelY = Math.floor(((1 - (latMerc / Math.PI)) / 2 * Math.pow(2, zoom) - y) * 256);
    
    const p = ctx.getImageData(pixelX, pixelY, 1, 1).data;
    
    const elevation = -10000 + ((p[0] * 65536 + p[1] * 256 + p[2]) * 0.1);
    return elevation;
  } catch (err) {
    console.warn("API terrain fetch failed, stepping back to client canvas calculation pipeline:", err);
    return map.queryTerrainElevation([lng, lat]) || 25.0; 
  }
}

map.on('style.load', () => {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      'type': 'raster-dem',
      'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
      'tileSize': 512,
      'maxzoom': 17
    });
  }
});

map.on('load', async () => {
  map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
  
  geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    marker: false,
    placeholder: 'Search location',
    proximity: initialCenter,
    types: 'country,region,place,locality,neighborhood,address'
  });
  map.addControl(geocoder, 'top-left');
  
  geocoder.on('result', async (event) => {
    const [lng, lat] = event.result.center;
    const point = new mapboxgl.LngLat(lng, lat);
    if (activeMarker) {
      activeMarker.setLngLat(point);
    } else {
      activeMarker = new mapboxgl.Marker({ color: '#1c96c5' }).setLngLat(point).addTo(map);
    }
    map.flyTo({ center: point, zoom: 17, pitch: 45});
    await triggerAnalysis(point);
  });
  
  // Load Flooded Areas from Firebase (DO NOT load color risks on initial render; set visibility: 'none')
  db.ref('Flooded_Areas').once('value').then(snapshot => {
    const data = snapshot.val();
    if (!data) return;

    riskLayers = { severe: [], high: [], moderate: [], low: [] };

    Object.entries(data).forEach(([id, f], i) => {
      if (!f.geojson) return;
      const sourceId = `flood-src-${i}`;
      const layerId = `flood-layer-${i}`;
      
      const vulnVal = f.vulnerability ?? f.risk_level ?? f.risk ?? 0;
      const riskCat = getRiskCategory(vulnVal);
      riskLayers[riskCat].push(layerId);

      map.addSource(sourceId, { type: 'geojson', data: f.geojson });
      map.addLayer({
        id: layerId,
        type: f.type === 'municipality' ? 'line' : 'fill',
        source: sourceId,
        layout: {
          'visibility': 'none' // Hidden by default until checkbox is checked
        },
        paint: f.type === 'municipality' ? 
        { 'line-color': '#1c96c5', 'line-width': 2 } : 
        { 'fill-color': getFloodColor(vulnVal), 'fill-opacity': 0.5 }
      });
    });
  });
  
  const startPoint = mapboxgl.LngLat.convert(initialCenter);
  activeMarker = new mapboxgl.Marker({ color: '#1c96c5' })
  .setLngLat(startPoint)
  .addTo(map);
  
  setupRiverStations();
});

// Checkbox toggle event listeners for controlling map layer visibility by risk level
document.querySelectorAll('.risk-toggle').forEach(checkbox => {
  checkbox.addEventListener('change', function(e) {
    const category = e.target.value;
    const visibility = e.target.checked ? 'visible' : 'none';
    if (riskLayers[category]) {
      riskLayers[category].forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      });
    }
  });
});

map.on('click', async (e) => {
  if (activeMarker) {
    activeMarker.setLngLat(e.lngLat);
  } else {
    activeMarker = new mapboxgl.Marker({ color: '#1c96c5' })
    .setLngLat(e.lngLat)
    .addTo(map);
  }
  document.querySelectorAll('.mapboxgl-popup').forEach(p => p.remove());
  await triggerAnalysis(e.lngLat);
}); 

const liveDataStore = {
  data: { level: 0, flow: 0, rain: 0, timeInfo: "" },
  data2: { level: 0, flow: 0, rain: 0, timeInfo: "" },
  data3: { level: 0, flow: 0, rain: 0, timeInfo: "" }
};

async function populateRiverData() {
  try {
    const snapshot = await db.ref('pins').once('value');
    if (snapshot.exists()) {
      const loadedRivers = [];
      
      snapshot.forEach(childSnapshot => {
        const pinConfig = childSnapshot.val();
        
        if (pinConfig.node) {
          const targetLatitude = pinConfig.lat ?? pinConfig.latitude;
          const targetLongitude = pinConfig.lng ?? pinConfig.longitude;
          
          loadedRivers.push({
            brgyId: childSnapshot.key, 
            name: pinConfig.name || pinConfig.barangayName || "Unknown River Station",
            lat: targetLatitude ? parseFloat(targetLatitude) : 18.1959782,
            lng: targetLongitude ? parseFloat(targetLongitude) : 120.5927871,
            node: pinConfig.node 
          });
        }
      });
      
      rivers = loadedRivers;
      console.log("Successfully loaded data into rivers registry:", rivers);
      
      await updateStationPinsIndividually();
    }
  } catch (error) {
    console.error("Error populating the rivers array from dynamic pins ref:", error);
  }
}

function setupRiverStations() {
  ['data', 'data2', 'data3'].forEach(nodeKey => {
    db.ref(nodeKey).orderByKey().limitToLast(1).on('value', async (snapshot) => {
      if (!snapshot.exists()) return;
      snapshot.forEach(child => {
        const latest = child.val();
        
        const itemDate = latest.dt ?? latest.date ?? "";
        const itemTime = latest.t ?? latest.time ?? "";
        
        liveDataStore[nodeKey] = {
          level: parseFloat(latest.level ?? latest.water ?? latest.water_level ?? 0),
          flow: parseFloat(latest.flow ?? latest.discharge ?? 0),
          rain: parseFloat(latest.rain ?? latest.rainfall ?? 0),
          timeInfo: (itemDate && itemTime) ? `${itemDate} | ${itemTime}` : (itemDate || itemTime || "")
        };
      });
      await updateStationPinsIndividually();
    });
  });
}

async function updateStationPinsIndividually() {
  stationMarkersArray.forEach(m => m.remove());
  stationMarkersArray = [];
  
  const riverMenu = document.getElementById('riverDropdownMenu');
  if (riverMenu) riverMenu.innerHTML = '';
  
  for (const river of rivers) {
    const telemetry = liveDataStore[river.node];
    const elevation = await getElevationFromCoords(river.lng, river.lat);
    
    let riskScore = 0;
    let dynamicPinColor = '#198754';
    
    if (model && minVals.length > 0 && maxVals.length > 0) {
      try {
        const rawFeatures = [telemetry.level, telemetry.rain, telemetry.flow, elevation];
        const normFeatures = normalize(rawFeatures);
        const predictionTensor = model.predict(tf.tensor2d([normFeatures]));
        const predictionResult = await predictionTensor.data();
        riskScore = Math.round(predictionResult[0] * 100);
        dynamicPinColor = getFloodMarkerColor(riskScore);
      } catch (err) {
        console.error("TensorFlow processing pipeline error:", err);
      }
    }
    
    if (dynamicPinColor === '#198754') {
      continue; 
    }
    
    const indexPosition = rivers.indexOf(river);
    const probChartId = `riverProb-${indexPosition}`;
    const popup = new mapboxgl.Popup({ offset: 25 });
    
    const markerInstance = new mapboxgl.Marker({ color: dynamicPinColor })
    .setLngLat([river.lng, river.lat])
    .setPopup(popup)
    .addTo(map);
    
    markerInstance.getElement().addEventListener('click', async (e) => {
      e.stopPropagation();
      
      map.flyTo({
        center: [river.lng, river.lat],
        zoom: 17,
        essential: true,
        pitch: 45
      });
      
      document.querySelectorAll('.mapboxgl-popup').forEach(p => p.remove());
      
      currentFirebaseTimestamp = telemetry.timeInfo;
      
      const mapboxCoords = new mapboxgl.LngLat(river.lng, river.lat);
      await triggerAnalysis(mapboxCoords, telemetry);
      
      const kpiRiskEl = document.getElementById("kpiRisk");
      const topRiskText = riskScore < 30 ? ["Low", "green"] : riskScore < 70 ? ["Moderate", "orange"] : ["Severe", "red"];
      if (kpiRiskEl) {
        kpiRiskEl.innerHTML = `<b style="color:${topRiskText[1]}">${riskScore}% - ${topRiskText[0]}</b>`;
      }
      
      const forecastData = await getForecast([telemetry.level, telemetry.rain, telemetry.flow, elevation]);
      
      popup.setHTML(`
      <div class="popup-chart-container" style="min-width: 180px; font-family: system-ui, sans-serif;">
          <h6 class="fw-bold mb-2 text-dark border-bottom pb-1" style="font-size: 0.85rem;">${river.name}</h6>
          <div class="d-flex justify-content-between mb-2 text-center border-bottom pb-2" style="font-size: 0.75rem;">
              <div><small class="text-muted d-block" style="font-size: 0.55rem;">LEVEL</small><strong>${telemetry.level.toFixed(2)}m</strong></div>
              <div><small class="text-muted d-block" style="font-size: 0.55rem;">FLOW</small><strong>${telemetry.flow.toFixed(1)}</strong></div>
              <div><small class="text-muted d-block" style="font-size: 0.55rem;">RAIN</small><strong>${telemetry.rain.toFixed(1)}</strong></div>
              <div><small class="text-muted d-block" style="font-size: 0.55rem;">RISK</small><strong style="color: ${dynamicPinColor}">${riskScore}%</strong></div>
          </div>
          <div class="mt-2 pt-1">
              <span style="font-size: 0.65rem; font-weight: bold; color: #555;">24h Forecast Probability Trend</span>
              <div style="height: 70px; width: 100%;"><canvas id="${probChartId}"></canvas></div>
          </div>
      </div>
  `);
      
      markerInstance.togglePopup();
    });
    
    stationMarkersArray.push(markerInstance);
    
    if (riverMenu) {
      const li = document.createElement('li');
      li.innerHTML = `<a class="dropdown-item small" href="#"><i class="bi bi-geo-alt" style="color: ${dynamicPinColor}"></i> ${river.name}</a>`;
      li.onclick = async () => {
        map.flyTo({ center: [river.lng, river.lat], zoom: 17, pitch: 45});
        
        currentFirebaseTimestamp = telemetry.timeInfo;
        const mapboxCoords = new mapboxgl.LngLat(river.lng, river.lat);
        await triggerAnalysis(mapboxCoords, telemetry);
        
        const kpiRiskEl = document.getElementById("kpiRisk");
        const topRiskText = riskScore < 30 ? ["Low", "green"] : riskScore < 70 ? ["Moderate", "orange"] : ["Severe", "red"];
        if (kpiRiskEl) {
          kpiRiskEl.innerHTML = `<b style="color:${topRiskText[1]}">${riskScore}% - ${topRiskText[0]}</b>`;
        }
        
        if (!markerInstance.getPopup().isOpen()) {
          markerInstance.togglePopup();
        }
      };
      riverMenu.appendChild(li);
    }
    
    popup.on('open', async () => {
      const forecastData = await getForecast([telemetry.level, telemetry.rain, telemetry.flow, elevation]);
      
      setTimeout(() => {
        const pCtx = document.getElementById(probChartId);
        if (!pCtx) return;
        
        let existingChart = Chart.getChart(pCtx);
        if (existingChart) existingChart.destroy();
        
        new Chart(pCtx, {
          type: 'line',
          data: {
            labels: ["Now", "+3h", "+12h", "+24h"],
            datasets: [{
              label: 'Prob %',
              data: forecastData,
              borderColor: dynamicPinColor,
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              fill: true,
              tension: 0.4,
              pointRadius: 2
            }]
          },
          options: {
            plugins: { legend: { display: false } },
            maintainAspectRatio: false,
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 7 } } },
              y: { beginAtZero: true, max: 100, ticks: { font: { size: 7 } } }
            }
          }
        });
      }, 50); 
    });
  }
}

async function triggerAnalysis(lngLat, forcedTelemetry = null) {
  const elevation = await getElevationFromCoords(lngLat.lng, lngLat.lat);
  const elevInput = document.getElementById('elevation');
  if (elevInput) {
    elevInput.value = Math.round(elevation);
  }

  let currentWater = 0;
  let currentRain = 0;
  let currentDischarge = 0;
  
  if (forcedTelemetry) {
    currentWater = parseFloat(forcedTelemetry.level) || 0;
    currentRain = parseFloat(forcedTelemetry.rain) || 0;
    currentDischarge = parseFloat(forcedTelemetry.flow) || 0;

    setSensorInputs(currentWater, currentRain, currentDischarge);
  } else {
    currentWater = parseFloat(document.getElementById('waterLevel')?.value) || 0;
    currentRain = parseFloat(document.getElementById('rainfall')?.value) || 0;
    currentDischarge = parseFloat(document.getElementById('discharge')?.value) || 0;

    updateKPIs();
  }
  
  let finalRisk = 0;
  if (model && minVals.length > 0 && maxVals.length > 0) {
    try {
      const rawFeatures = [currentWater, currentRain, currentDischarge, elevation];
      const normFeatures = normalize(rawFeatures);
      const predictionTensor = model.predict(tf.tensor2d([normFeatures]));
      const predictionResult = await predictionTensor.data();
      finalRisk = Math.round(predictionResult[0] * 100);
    } catch (err) {
      console.error("TensorFlow runtime processing error:", err);
    }
  }
  
  const kpiRiskEl = document.getElementById("kpiRisk");
  const topRiskText = finalRisk < 30 ? ["Low", "green"] : finalRisk < 70 ? ["Moderate", "orange"] : ["Severe", "red"];
  if (kpiRiskEl) {
    kpiRiskEl.innerHTML = `<b style="color:${topRiskText[1]}">${finalRisk}% - ${topRiskText[0]}</b>`;
  }
  
  let interpretText = "Low Risk Scenario";
  let interpretColor = "#198754"; 
  let recommendation = "The area displays low vulnerability under current metrics. Maintain standard community awareness.";
  
  if (finalRisk > 70) {
    interpretText = "Severe Flood Risk";
    interpretColor = "#dc3545"; 
    recommendation = `CRITICAL: High threat detected! Current factors indicator localized warnings concern. Prepare immediate high-ground evacuation protocols.`;
  } else if (finalRisk > 30) {
    interpretText = "Moderate Flood Risk";
    interpretColor = "#fd7e14"; 
    recommendation = `CAUTION: Elevating indices monitored. Moderate vulnerability observed. Secure low-lying equipment and proactive sandbag lines.`;
  }
  
  let waterInterpretText = "Normal";
  let waterInterpretColor = "#198754"; 
  
  if (currentWater > 5.0) { 
    waterInterpretText = "Critical";
    waterInterpretColor = "#dc3545"; 
  } else if (currentWater > 2.5) { 
    waterInterpretText = "Elevated";
    waterInterpretColor = "#fd7e14"; 
  }
  
  const geoQuery = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngLat.lng},${lngLat.lat}.json?access_token=${mapboxgl.accessToken}&types=address,neighborhood,place,locality`;
  let locName = "Selected Coordinate Point";
  let municipality = null;
  try {
    const resp = await fetch(geoQuery);
    const data = await resp.json();
    if (data.features?.length > 0) {
      const f = data.features[0];
      locName = f.place_name.split(',')[0];
      if (/laoag/i.test(f.place_name)) municipality = 'Laoag';
      if (/pasuquin/i.test(f.place_name)) municipality = 'Pasuquin';
      if (/bacarra/i.test(f.place_name)) municipality = 'Bacarra';
      if (!municipality && f.context) {
        f.context.forEach(ctx => {
          if (/laoag/i.test(ctx.text)) municipality = 'Laoag';
          if (/pasuquin/i.test(ctx.text)) municipality = 'Pasuquin';
          if (/bacarra/i.test(ctx.text)) municipality = 'Bacarra';
        });
      }
    }
  } catch (err) {
    console.error("Geocode error lookup details:", err);
  }
  
  try {
    if (municipality === 'Laoag') {
      subscribeToMunicipalityData('Laoag');
    } else if (municipality === 'Pasuquin') {
      subscribeToMunicipalityData('Pasuquin');
    } else if (municipality === 'Bacarra') {
      subscribeToMunicipalityData('Bacarra');
    } else {
      detachCurrentDataListener();
      document.getElementById('status').innerHTML = 'Area outside Laoag/Pasuquin — running localized neural grid.';
    }
  } catch (err) {
    console.error('Error loading municipality sensor values:', err);
  }
  
  const generateHtmlContent = () => `
      <div style="padding:8px; font-family: system-ui, -apple-system, sans-serif;">
          <h6 class="fw-bold mb-1 border-bottom pb-1" style="color:#1c96c5; font-size: 0.95rem;">System Field Analysis</h6>
          <small class="d-block mb-2 text-muted" style="font-size: 0.75rem;">${locName}</small>
      
          <div class="d-flex justify-content-between">
              <span class="text-muted">Target Elevation:</span>
              <span class="fw-semibold">${elevation.toFixed(1)}m</span>
          </div>

          <div class="d-flex justify-content-between mt-1">
              <span class="text-muted">Current Water Level:</span>
              <span class="fw-semibold">${currentWater.toFixed(2)}m 
                  <small style="color: ${waterInterpretColor}; font-weight: 700; margin-left: 4px;">(${waterInterpretText})</small>
              </span>
          </div>
          
          <div class="mt-2 pt-2 border-top">
              <span class="text-muted d-block text-uppercase" style="font-size: 0.68rem; font-weight: 700; letter-spacing: 0.5px;">Model Interpretation</span>
              <span class="fw-bold d-block" style="color: ${interpretColor}; font-size: 0.92rem;">${interpretText}</span>
          </div>
          
          <div class="mt-2">
              <span class="text-muted d-block text-uppercase" style="font-size: 0.68rem; font-weight: 700; letter-spacing: 0.5px;">Actionable Recommendation</span>
              <p class="mb-0 text-dark text-start" style="font-size: 0.78rem; text-align: justify; margin-top: 2px;">${recommendation}</p>
          </div>
      </div>
  `;
  
  const infoPanel = document.getElementById('details'); 
  if (infoPanel) {
    infoPanel.innerHTML = generateHtmlContent();
  }
}

async function getForecast(currentInput) {
  const horizons = [1, 3, 12, 24];
  let last = [...currentInput];
  const predictions = [];
  if (!model) return [0, 0, 0, 0];
  for (const h of horizons) {
    const pred = await model.predict(tf.tensor2d([normalize(last)])).data();
    predictions.push(pred[0] * 100);
    last[0] += 0.05; 
  }
  return predictions;
}

function normalize(row){ return row.map((v,i)=> (maxVals[i]-minVals[i])===0?0:(v-minVals[i])/(maxVals[i]-minVals[i])); }

document.getElementById('csvFileInput')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if(lines.length < 2) return alert("Insufficient data structural lines in selected CSV.");
    
    const firstLine = lines[0].toLowerCase();
    let indexOffset = 0;
    if (firstLine.includes('water') || firstLine.includes('rain') || firstLine.includes('label')) {
      indexOffset = 1;
    }
    
    parsedCsvFeatures = [];
    parsedCsvLabels = [];
    
    for(let i = indexOffset; i < lines.length; i++) {
      const columns = lines[i].split(',').map(v => parseFloat(v.trim()));
      if(columns.length >= 5 && !columns.some(isNaN)) {
        parsedCsvFeatures.push([columns[0], columns[1], columns[2], columns[3]]);
        parsedCsvLabels.push(columns[4]);
      }
    }
    
    if(parsedCsvFeatures.length === 0) {
      document.getElementById("status").innerHTML = "Error parsing file format matrices.";
      document.getElementById('trainBtn').disabled = true;
    } else {
      document.getElementById("status").innerHTML = `Parsed ${parsedCsvFeatures.length} records locally. Ready to train.`;
      document.getElementById('trainBtn').disabled = false;
    }
  };
  reader.readAsText(file);
});

async function autoTrain(){
  if(parsedCsvFeatures.length === 0) return alert("Please select a local CSV file first.");
  document.getElementById("status").innerHTML="Slicing data vectors locally...";
  
  const splitIndex = Math.floor(parsedCsvFeatures.length * 0.8);
  let trainX = parsedCsvFeatures.slice(0, splitIndex);
  let testX  = parsedCsvFeatures.slice(splitIndex);
  let trainY = parsedCsvLabels.slice(0, splitIndex);
  let testY  = parsedCsvLabels.slice(splitIndex);
  
  minVals = tf.min(tf.tensor2d(trainX), 0).arraySync();
  maxVals = tf.max(tf.tensor2d(trainX), 0).arraySync();
  trainX = trainX.map(normalize);
  testX  = testX.map(normalize);
  
  const xsTrain = tf.tensor2d(trainX);
  const ysTrain = tf.tensor2d(trainY, [trainY.length, 1]);
  const xsTest = tf.tensor2d(testX);
  const ysTest = tf.tensor2d(testY, [testY.length, 1]);
  
  model = tf.sequential();
  model.add(tf.layers.dense({inputShape: [4], units: 128, activation: 'relu'}));
  model.add(tf.layers.dense({units: 64, activation: 'relu'}));
  model.add(tf.layers.dense({units: 32, activation: 'relu'}));
  model.add(tf.layers.dense({units: 16, activation: 'relu'}));
  model.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
  model.compile({optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy']});
  
  document.getElementById("status").innerHTML = "Optimizing weights matrix...";
  await model.fit(xsTrain, ysTrain, {epochs: 150, batchSize: 16, shuffle: true, validationData: [xsTest, ysTest]});
  document.getElementById("status").innerHTML = "Training Complete";
  
  evaluateModel(xsTest, ysTest);
  manualPredict();
}

async function evaluateModel(xs, ys) {
  const predVals = await model.predict(xs).data();
  const trueVals = await ys.data();
  let tp = 0, tn = 0, fp = 0, fn = 0;
  
  for (let i = 0; i < predVals.length; i++) {
    let p = predVals[i] >= 0.5 ? 1 : 0;
    if (p == 1 && trueVals[i] == 1) tp++;
    else if (p == 0 && trueVals[i] == 0) tn++;
    else if (p == 1 && trueVals[i] == 0) fp++;
    else fn++;
  }
  
  lastConfData = [tp, fp, tn, fn];
  let accuracy = (tp + tn) / (tp + tn + fp + fn || 1);
  let precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  let f1 = 2 * ((precision * recall) / (precision + recall || 1));
  
  let points = [];
  for (let t = 0; t <= 1.01; t += 0.05) {
    let tp_t = 0, fp_t = 0, tn_t = 0, fn_t = 0;
    for (let i = 0; i < predVals.length; i++) {
      let p = predVals[i] >= t ? 1 : 0;
      if (p == 1 && trueVals[i] == 1) tp_t++;
      else if (p == 1 && trueVals[i] == 0) fp_t++;
      else if (p == 0 && trueVals[i] == 0) tn_t++;
      else fn_t++;
    }
    points.push({ fpr: fp_t / (fp_t + tn_t || 1), tpr: tp_t / (tp_t + fn_t || 1) });
  }
  points.sort((a, b) => a.fpr - b.fpr);
  lastRocPoints = points;
  
  let auc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    auc += (points[i+1].fpr - points[i].fpr) * (points[i+1].tpr + points[i].tpr) / 2;
  }
  lastAUC = Math.abs(auc);
  
  document.getElementById("status").innerHTML +=
  `&emsp;<b>Accuracy:</b> ${accuracy.toFixed(3)}&emsp;<b>Precision:</b> ${precision.toFixed(3)}&emsp;<b>Recall:</b> ${recall.toFixed(3)}, &emsp;<b>F1:</b> ${f1.toFixed(3)}`;
  
  await updateStationPinsIndividually();
}

async function manualPredict(){
  if(!model) return;
  const input = [
  parseFloat(document.getElementById('waterLevel').value), 
  parseFloat(document.getElementById('rainfall').value), 
  parseFloat(document.getElementById('discharge').value), 
  parseFloat(document.getElementById('elevation').value)
  ];
  updateKPIs();
  await generateForecastChart(input);
}

async function generateForecastChart(current){
  const horizons = [1, 3, 12, 24];
  let last = [...current];
  const predictions = [];
  for(const h of horizons){
    const pred = await model.predict(tf.tensor2d([normalize(last)])).data();
    predictions.push(pred[0] * 100);
    last[0] += 0.05; 
  }
  const v = Math.round(predictions[0]);
  const r = v < 30 ? ["Low","green"] : v < 70 ? ["Moderate","orange"] : ["Severe","red"];
  document.getElementById("kpiRisk").innerHTML = `<b style="color:${r[1]}">${v}% - ${r[0]}</b>`;
}

async function saveModel() {
  if (!model) return alert("Train first!");
  const status = document.getElementById("status");
  status.innerHTML = "Saving serialized data...";
  await model.save(tf.io.withSaveHandler(async (artifacts) => {
    const weightsBlob = new Blob([artifacts.weightData], {type: 'application/octet-stream'});
    await storageRef.child('models/flood_weights.bin').put(weightsBlob);
    const modelConfig = { modelTopology: artifacts.modelTopology, weightSpecs: artifacts.weightSpecs, metadata: { minVals, maxVals } };
    const configBlob = new Blob([JSON.stringify(modelConfig)], {type: 'application/json'});
    await storageRef.child('models/flood_model.json').put(configBlob);
    status.innerHTML = "Saved to Cloud Storage!";
    return { modelArtifactsInfo: { dateSaved: new Date() } };
  }));
}

async function loadModel() {
  const status = document.getElementById("status");
  status.innerHTML = "Downloading Architecture Down...";
  
  try {
    const jsonUrl = await storageRef.child('models/flood_model.json').getDownloadURL();
    const weightsUrl = await storageRef.child('models/flood_weights.bin').getDownloadURL();
    
    const config = await (await fetch(jsonUrl)).json();
    const weights = await (await fetch(weightsUrl)).arrayBuffer();
    
    minVals = config.metadata.minVals;
    maxVals = config.metadata.maxVals;
    
    model = await tf.loadLayersModel(tf.io.fromMemory(
    config.modelTopology,
    config.weightSpecs,
    weights
    ));
    
    status.innerHTML = "Model Loaded Active. Select an area or search on the map to view flood risk.";
    
    await updateStationPinsIndividually();
  } catch (err) {
    status.innerHTML = "Load Error: Check CORS configurations.";
    console.error(err);
  }
}

document.getElementById('trainBtn').onclick = autoTrain;
document.getElementById('saveBtn').onclick = saveModel;
document.getElementById('loadBtn').onclick = loadModel;
document.getElementById('predictBtn').onclick = manualPredict;

document.getElementById('logoutLink')?.addEventListener('click', function (e) {
  e.preventDefault();

  Swal.fire({
      title: 'Logout?',
      text: 'Are you sure you want to log out?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, Logout',
      cancelButtonText: 'No'
  }).then((result) => {
      if (result.isConfirmed) {
          sessionStorage.clear();

          Swal.fire({
              title: 'Logged Out',
              text: 'You have been logged out successfully.',
              icon: 'success',
              timer: 1500,
              showConfirmButton: false
          }).then(() => {
              window.location.href = 'log.html';
          });
      }
  });
});