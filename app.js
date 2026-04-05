/* ================================
   TáxiRota — Aplicação principal
   ================================ */

// =============== Estado global ===============
const state = {
  map: null,
  driverLocation: { lng: -46.6333, lat: -23.5505 }, // São Paulo (padrão)
  passengers: [],
  currentStep: 'pickup', // pickup | dropoff
  currentDraftPassenger: null,
  vehicle: null,
  fuel: 'gasolina',
  fuelPrice: 6.19,
  route: null,          // resultado da otimização
  osrmSteps: [],        // passos de navegação (OSRM)
  osrmGeometry: null,   // geojson da linha do trajeto
  navigating: false,
  currentStepIdx: 0,
  is3D: true,
};

const PAX_COLORS = ['#2e6fd6', '#8a3ffc', '#d24d57', '#1f8a4c', '#e67e22'];

// =============== Inicialização ===============
document.addEventListener('DOMContentLoaded', () => {
  initVehicleSelect();
  initMap();
  bindUI();
  updateVehicleInfo();
});

// =============== Veículos ===============
function initVehicleSelect() {
  const sel = document.getElementById('vehicle-select');
  VEHICLES.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.model;
    sel.appendChild(opt);
  });
  state.vehicle = VEHICLES[0];

  sel.addEventListener('change', e => {
    state.vehicle = VEHICLES.find(v => v.id === e.target.value);
    syncFuelOptions();
    updateVehicleInfo();
  });

  document.getElementById('fuel-select').addEventListener('change', e => {
    state.fuel = e.target.value;
    state.fuelPrice = FUEL_REFERENCE_PRICE[state.fuel];
    document.getElementById('fuel-price').value = state.fuelPrice.toFixed(2);
    updateVehicleInfo();
  });

  document.getElementById('fuel-price').addEventListener('input', e => {
    state.fuelPrice = parseFloat(e.target.value) || 0;
    updateVehicleInfo();
  });

  syncFuelOptions();
}

function syncFuelOptions() {
  const fuelSel = document.getElementById('fuel-select');
  const available = Object.keys(state.vehicle.consumption);
  Array.from(fuelSel.options).forEach(opt => {
    opt.disabled = !available.includes(opt.value);
  });
  if (!available.includes(state.fuel)) {
    state.fuel = available[0];
    fuelSel.value = state.fuel;
    state.fuelPrice = FUEL_REFERENCE_PRICE[state.fuel];
    document.getElementById('fuel-price').value = state.fuelPrice.toFixed(2);
  }
}

function updateVehicleInfo() {
  const kmPerL = state.vehicle.consumption[state.fuel];
  const costKm = kmPerL ? (state.fuelPrice / kmPerL) : 0;
  document.getElementById('car-consumption').textContent = kmPerL ? kmPerL.toFixed(1) + ' km/L' : '—';
  document.getElementById('car-cost-km').textContent = 'R$ ' + costKm.toFixed(2);
}

// =============== Mapa 3D ===============
function initMap() {
  state.map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [state.driverLocation.lng, state.driverLocation.lat],
    zoom: 13,
    pitch: 55,
    bearing: -18,
    antialias: true,
  });

  state.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

  state.map.on('load', () => {
    // Camada de trajeto
    state.map.addSource('route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    // Sombra do trajeto (outline)
    state.map.addLayer({
      id: 'route-shadow',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#0b2545',
        'line-width': 10,
        'line-opacity': 0.35,
      }
    });
    // Linha principal
    state.map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#2e6fd6',
        'line-width': 6,
        'line-opacity': 0.95,
      }
    });

    // Camada de seta do sentido do trajeto
    state.map.addSource('route-arrows', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // garante que a camada 3D de edifícios está ativa (fornecida pelo estilo liberty)
    ensureBuildings3D();

    // marcador do motorista
    addDriverMarker();
  });

  // Clique no mapa para adicionar paradas
  state.map.on('click', handleMapClick);

  // cursor
  state.map.on('mouseenter', 'passenger-markers', () => state.map.getCanvas().style.cursor = 'pointer');
  state.map.on('mouseleave', 'passenger-markers', () => state.map.getCanvas().style.cursor = '');
}

function ensureBuildings3D() {
  const layers = state.map.getStyle().layers || [];
  // Já existe uma camada de edifícios 3D no estilo liberty? Se não, criamos.
  const hasBuildings3D = layers.some(l => l.id === '3d-buildings' || (l.type === 'fill-extrusion'));
  if (hasBuildings3D) return;
  const source = state.map.getSource('openmaptiles') ? 'openmaptiles' : null;
  if (!source) return;
  state.map.addLayer({
    id: '3d-buildings',
    source,
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': '#dce3ec',
      'fill-extrusion-height': ['get', 'render_height'],
      'fill-extrusion-base':   ['get', 'render_min_height'],
      'fill-extrusion-opacity': 0.85,
    }
  });
}

let driverMarker = null;
function addDriverMarker() {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 36px; height: 36px; border-radius: 50%;
    background: #f4c430; border: 3px solid #0b2545;
    box-shadow: 0 4px 12px rgba(11,37,69,0.35);
    display: flex; align-items: center; justify-content: center;
    font-weight: 900; color: #0b2545; font-size: 18px;
  `;
  el.textContent = '🚖';
  driverMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([state.driverLocation.lng, state.driverLocation.lat])
    .addTo(state.map);
}

// =============== UI Bindings ===============
function bindUI() {
  document.getElementById('btn-add-passenger').addEventListener('click', startNewPassenger);
  document.getElementById('btn-clear').addEventListener('click', clearAll);
  document.getElementById('btn-calculate').addEventListener('click', calculateRoute);
  document.getElementById('btn-accept').addEventListener('click', acceptAndStartNavigation);
  document.getElementById('btn-3d').addEventListener('click', toggle3D);
  document.getElementById('btn-recenter').addEventListener('click', recenter);
  document.getElementById('btn-locate').addEventListener('click', locateMe);
  document.getElementById('btn-stop-nav').addEventListener('click', stopNavigation);

  // marca botão 3D como ativo
  document.getElementById('btn-3d').classList.add('active');

  // Pronto para começar: prepara primeiro passageiro
  startNewPassenger();
}

function startNewPassenger() {
  if (state.passengers.length >= 4) {
    alert('Máximo de 4 passageiros por corrida.');
    return;
  }
  const id = 'p' + Date.now();
  state.currentDraftPassenger = {
    id,
    name: 'Passageiro ' + (state.passengers.length + 1),
    color: PAX_COLORS[state.passengers.length],
    pickup: null,
    dropoff: null,
  };
  state.currentStep = 'pickup';
  updatePickupModeUI();
  setStatus('Toque no mapa para marcar o EMBARQUE de ' + state.currentDraftPassenger.name, 'nav');
}

function updatePickupModeUI() {
  const container = document.getElementById('pickup-mode');
  container.querySelectorAll('.pickup-step').forEach(el => {
    el.classList.toggle('active', el.dataset.step === state.currentStep);
  });
  container.style.display = state.currentDraftPassenger ? 'flex' : 'none';
}

function clearAll() {
  if (!confirm('Limpar todos os passageiros e a rota?')) return;
  state.passengers = [];
  state.currentDraftPassenger = null;
  state.route = null;
  state.osrmGeometry = null;
  state.osrmSteps = [];
  renderPassengers();
  clearRouteOnMap();
  clearPassengerMarkers();
  document.getElementById('route-summary').classList.add('hidden');
  document.getElementById('btn-calculate').disabled = true;
  setStatus('Pronto para embarcar');
  startNewPassenger();
}

// =============== Cliques no mapa ===============
function handleMapClick(e) {
  if (state.navigating) return;
  if (!state.currentDraftPassenger) return;

  const coord = { lng: e.lngLat.lng, lat: e.lngLat.lat };
  const draft = state.currentDraftPassenger;

  if (state.currentStep === 'pickup') {
    draft.pickup = coord;
    state.currentStep = 'dropoff';
    updatePickupModeUI();
    setStatus('Agora toque o DESEMBARQUE de ' + draft.name, 'nav');
  } else {
    draft.dropoff = coord;
    state.passengers.push(draft);
    state.currentDraftPassenger = null;
    updatePickupModeUI();
    setStatus(draft.name + ' adicionado. ' + (state.passengers.length < 4 ? 'Toque em “Novo passageiro” para adicionar outro.' : 'Capacidade máxima atingida.'));
    document.getElementById('btn-calculate').disabled = state.passengers.length === 0;
  }

  renderPassengers();
  renderPassengerMarkers();
}

// =============== Renderização de passageiros ===============
function renderPassengers() {
  const list = document.getElementById('passenger-list');
  list.innerHTML = '';
  state.passengers.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'passenger-item';
    li.innerHTML = `
      <span class="pax-avatar" style="background:${p.color}">${i + 1}</span>
      <div class="pax-details">
        <div class="pax-name">${p.name}</div>
        <div class="pax-route">${fmtCoord(p.pickup)} → ${fmtCoord(p.dropoff)}</div>
      </div>
      <button class="pax-remove" data-id="${p.id}" title="Remover">✕</button>
    `;
    list.appendChild(li);
  });
  list.querySelectorAll('.pax-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.passengers = state.passengers.filter(p => p.id !== btn.dataset.id);
      renderPassengers();
      renderPassengerMarkers();
      document.getElementById('btn-calculate').disabled = state.passengers.length === 0;
    });
  });
  document.getElementById('pax-counter').textContent = state.passengers.length + ' / 4';
}

function fmtCoord(c) {
  if (!c) return '—';
  return c.lat.toFixed(4) + ', ' + c.lng.toFixed(4);
}

// =============== Marcadores de passageiros ===============
const passengerMarkers = [];
function clearPassengerMarkers() {
  passengerMarkers.forEach(m => m.remove());
  passengerMarkers.length = 0;
}
function renderPassengerMarkers() {
  clearPassengerMarkers();
  state.passengers.forEach((p, idx) => {
    // embarque (verde)
    const pEl = buildMarkerElement((idx + 1) + 'E', '#1f8a4c');
    passengerMarkers.push(
      new maplibregl.Marker({ element: pEl, anchor: 'bottom' })
        .setLngLat([p.pickup.lng, p.pickup.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<b>${p.name}</b><br>Embarque`))
        .addTo(state.map)
    );
    // desembarque (azul)
    const dEl = buildMarkerElement((idx + 1) + 'D', '#0b2545');
    passengerMarkers.push(
      new maplibregl.Marker({ element: dEl, anchor: 'bottom' })
        .setLngLat([p.dropoff.lng, p.dropoff.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<b>${p.name}</b><br>Desembarque`))
        .addTo(state.map)
    );
  });
}
function buildMarkerElement(text, color) {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 34px; height: 42px;
    background: ${color};
    border: 3px solid white;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 4px 10px rgba(0,0,0,0.28);
    display: flex; align-items: center; justify-content: center;
  `;
  const inner = document.createElement('span');
  inner.textContent = text;
  inner.style.cssText = 'color:white;font-weight:900;font-size:11px;transform:rotate(45deg);';
  el.appendChild(inner);
  return el;
}

// =============== Cálculo da rota ===============
async function calculateRoute() {
  if (state.passengers.length === 0) return;
  setStatus('Calculando a melhor rota...', 'busy');
  document.getElementById('btn-calculate').disabled = true;

  // 1. Otimização lógica (ordem das paradas)
  const result = Logistics.optimizeRoute({
    passengers: state.passengers,
    origin: state.driverLocation,
    vehicle: state.vehicle,
    fuel: state.fuel,
    fuelPrice: state.fuelPrice,
  });
  state.route = result;

  // 2. Traçado real (OSRM público) entre as paradas
  const waypoints = [state.driverLocation, ...result.orderedStops.map(s => s.coord)];
  try {
    const osrm = await fetchOSRMRoute(waypoints);
    if (osrm) {
      state.osrmGeometry = osrm.geometry;
      state.osrmSteps = osrm.steps;
      // sobrescreve distância/tempo com valores reais do OSRM
      result.distance = osrm.distance / 1000;
      result.timeMin = osrm.duration / 60;
      result.litersUsed = result.distance / state.vehicle.consumption[state.fuel];
      result.fuelCost = result.litersUsed * state.fuelPrice;
    }
  } catch (err) {
    console.warn('OSRM indisponível, usando linha reta:', err);
  }

  renderRouteSummary(result);
  drawRouteOnMap(result, state.osrmGeometry);
  fitMapToRoute(waypoints);
  setStatus('Rota pronta — revise e aceite.');
  document.getElementById('btn-calculate').disabled = false;
}

async function fetchOSRMRoute(waypoints) {
  const coords = waypoints.map(c => `${c.lng},${c.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&annotations=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM error ' + res.status);
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) return null;
  const r = data.routes[0];
  const steps = [];
  r.legs.forEach((leg, legIdx) => {
    leg.steps.forEach(step => {
      steps.push({
        legIdx,
        distance: step.distance,
        duration: step.duration,
        name: step.name || '',
        maneuver: step.maneuver,
        instruction: buildInstruction(step),
      });
    });
  });
  return {
    distance: r.distance,
    duration: r.duration,
    geometry: r.geometry,
    steps,
  };
}

function buildInstruction(step) {
  const m = step.maneuver;
  const street = step.name ? ' na ' + step.name : '';
  const dir = {
    left: 'Vire à esquerda',
    right: 'Vire à direita',
    'slight left': 'Mantenha-se à esquerda',
    'slight right': 'Mantenha-se à direita',
    'sharp left': 'Vire totalmente à esquerda',
    'sharp right': 'Vire totalmente à direita',
    straight: 'Siga em frente',
    uturn: 'Faça o retorno',
  }[m.modifier] || 'Continue';

  switch (m.type) {
    case 'depart':     return 'Inicie o trajeto' + street;
    case 'arrive':     return 'Você chegou ao destino';
    case 'turn':       return dir + street;
    case 'new name':   return 'Continue' + street;
    case 'merge':      return 'Entre' + street;
    case 'on ramp':    return 'Pegue a saída' + street;
    case 'off ramp':   return 'Saia' + street;
    case 'fork':       return dir + street;
    case 'roundabout': return 'Entre na rotatória' + street;
    case 'rotary':     return 'Entre no retorno' + street;
    case 'continue':   return 'Continue' + street;
    default:           return dir + street;
  }
}

function renderRouteSummary(r) {
  document.getElementById('sm-distance').textContent = r.distance.toFixed(1) + ' km';
  document.getElementById('sm-time').textContent     = Math.round(r.timeMin) + ' min';
  document.getElementById('sm-fuel').textContent     = r.litersUsed.toFixed(2) + ' L';
  document.getElementById('sm-cost').textContent     = 'R$ ' + r.fuelCost.toFixed(2);

  const ul = document.getElementById('reasoning-list');
  ul.innerHTML = r.reasoning.map(t => '<li>' + t + '</li>').join('');

  const ol = document.getElementById('stops-list');
  ol.innerHTML = '';
  r.orderedStops.forEach(s => {
    const p = state.passengers.find(x => x.id === s.passengerId);
    const li = document.createElement('li');
    li.className = s.type === 'pickup' ? 'is-pickup' : 'is-dropoff';
    li.innerHTML = `<span class="stop-type">${s.type === 'pickup' ? 'Embarque' : 'Desembarque'}</span> ${p ? p.name : ''}`;
    ol.appendChild(li);
  });

  document.getElementById('route-summary').classList.remove('hidden');
}

function drawRouteOnMap(r, geometry) {
  const features = [];
  if (geometry) {
    features.push({ type: 'Feature', geometry, properties: {} });
  } else {
    // linha reta (fallback)
    const coords = [
      [state.driverLocation.lng, state.driverLocation.lat],
      ...r.orderedStops.map(s => [s.coord.lng, s.coord.lat]),
    ];
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {},
    });
  }
  state.map.getSource('route').setData({ type: 'FeatureCollection', features });
}
function clearRouteOnMap() {
  if (state.map && state.map.getSource('route')) {
    state.map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
  }
}

function fitMapToRoute(waypoints) {
  const bounds = new maplibregl.LngLatBounds();
  waypoints.forEach(c => bounds.extend([c.lng, c.lat]));
  state.map.fitBounds(bounds, { padding: 80, pitch: 55, bearing: -18, duration: 1200 });
}

// =============== Navegação guiada ===============
function acceptAndStartNavigation() {
  if (!state.route) return;
  state.navigating = true;
  state.currentStepIdx = 0;
  document.getElementById('nav-hud').classList.remove('hidden');
  setStatus('Navegando — siga as instruções por voz', 'nav');
  speak('Rota aceita. Iniciando navegação. ' + (state.osrmSteps[0]?.instruction || 'Siga em frente.'));
  updateNavHud();
  // flyTo primeiro ponto
  const first = state.route.orderedStops[0].coord;
  state.map.flyTo({
    center: [state.driverLocation.lng, state.driverLocation.lat],
    zoom: 16, pitch: 65, bearing: -18, duration: 1500,
  });

  // avança passos automaticamente (simulação didática)
  runStepProgress();
}

let stepTimer = null;
function runStepProgress() {
  if (!state.navigating) return;
  clearTimeout(stepTimer);
  const step = state.osrmSteps[state.currentStepIdx];
  if (!step) return;
  // próximo passo em tempo proporcional à duração do passo (acelerado 8×)
  const ms = Math.max(1800, (step.duration * 1000) / 8);
  stepTimer = setTimeout(() => {
    state.currentStepIdx++;
    if (state.currentStepIdx >= state.osrmSteps.length) {
      finalizeNavigation();
      return;
    }
    const next = state.osrmSteps[state.currentStepIdx];
    speak(next.instruction);
    updateNavHud();
    runStepProgress();
  }, ms);
}

function updateNavHud() {
  const step = state.osrmSteps[state.currentStepIdx];
  if (!step) return;
  document.getElementById('nav-distance').textContent = formatDist(step.distance);
  document.getElementById('nav-maneuver').textContent =
    (step.maneuver.modifier || step.maneuver.type || '').toUpperCase();
  document.getElementById('nav-instruction').textContent = step.instruction;

  // próxima parada
  const legIdx = step.legIdx;
  const nextStop = state.route.orderedStops[legIdx];
  if (nextStop) {
    const p = state.passengers.find(x => x.id === nextStop.passengerId);
    document.getElementById('nav-next-stop').textContent =
      (nextStop.type === 'pickup' ? 'Embarcar ' : 'Desembarcar ') + (p ? p.name : '');
  }
  const remaining = state.osrmSteps.slice(state.currentStepIdx).reduce((s, x) => s + x.distance, 0);
  document.getElementById('nav-remaining').textContent = formatDist(remaining);
}

function formatDist(m) {
  if (m < 1000) return Math.round(m) + ' m';
  return (m / 1000).toFixed(1) + ' km';
}

function finalizeNavigation() {
  speak('Trajeto concluído. Todos os passageiros foram entregues.');
  document.getElementById('nav-instruction').textContent = 'Trajeto concluído';
  document.getElementById('nav-distance').textContent = '—';
  setStatus('Corrida finalizada com sucesso');
  setTimeout(stopNavigation, 3500);
}

function stopNavigation() {
  state.navigating = false;
  clearTimeout(stepTimer);
  document.getElementById('nav-hud').classList.add('hidden');
  setStatus('Pronto para nova corrida');
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// =============== Voz (pt-BR) ===============
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  u.rate = 1.0;
  u.pitch = 1.0;
  u.volume = 1.0;
  // Escolhe voz PT-BR se disponível
  const voices = window.speechSynthesis.getVoices();
  const pt = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('pt'));
  if (pt) u.voice = pt;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// =============== Controles de mapa ===============
function toggle3D() {
  state.is3D = !state.is3D;
  state.map.easeTo({ pitch: state.is3D ? 55 : 0, bearing: state.is3D ? -18 : 0, duration: 600 });
  document.getElementById('btn-3d').classList.toggle('active', state.is3D);
}
function recenter() {
  state.map.flyTo({
    center: [state.driverLocation.lng, state.driverLocation.lat],
    zoom: 14, pitch: 55, bearing: -18, duration: 900,
  });
}
function locateMe() {
  if (!navigator.geolocation) {
    alert('GPS não disponível no aparelho.');
    return;
  }
  setStatus('Obtendo sua localização...', 'nav');
  navigator.geolocation.getCurrentPosition(pos => {
    state.driverLocation = { lng: pos.coords.longitude, lat: pos.coords.latitude };
    if (driverMarker) driverMarker.setLngLat([state.driverLocation.lng, state.driverLocation.lat]);
    state.map.flyTo({
      center: [state.driverLocation.lng, state.driverLocation.lat],
      zoom: 15, pitch: 55, bearing: -18, duration: 1200,
    });
    setStatus('Localização obtida');
  }, err => {
    alert('Não foi possível obter a localização: ' + err.message);
    setStatus('Pronto para embarcar');
  }, { enableHighAccuracy: true, timeout: 8000 });
}

// =============== Status ===============
function setStatus(text, mode) {
  document.getElementById('status-text').textContent = text;
  const pill = document.getElementById('status-pill');
  pill.classList.remove('nav', 'busy');
  if (mode) pill.classList.add(mode);
}
