/* ================================
   TáxiRota — Aplicação principal
   ================================ */

// =============== Estado global ===============
const state = {
  map: null,
  driverLocation: { lng: -46.6333, lat: -23.5505 }, // São Paulo (padrão)
  passengers: [],
  draft: {              // rascunho do passageiro sendo criado
    pickup: null,       // { lng, lat, label }
    dropoff: null,
  },
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

  // Restaura preferências salvas
  const savedFuel = localStorage.getItem('taxirota.fuel');
  const savedPrice = parseFloat(localStorage.getItem('taxirota.fuelPrice'));
  const savedCar = localStorage.getItem('taxirota.vehicle');
  if (savedCar) {
    const v = VEHICLES.find(x => x.id === savedCar);
    if (v) { state.vehicle = v; sel.value = savedCar; }
  }
  if (savedFuel && ['gasolina','etanol','diesel'].includes(savedFuel)) {
    state.fuel = savedFuel;
    document.getElementById('fuel-select').value = savedFuel;
  }
  if (!isNaN(savedPrice) && savedPrice > 0) {
    state.fuelPrice = savedPrice;
    document.getElementById('fuel-price').value = savedPrice.toFixed(2);
  }

  sel.addEventListener('change', e => {
    state.vehicle = VEHICLES.find(v => v.id === e.target.value);
    localStorage.setItem('taxirota.vehicle', state.vehicle.id);
    syncFuelOptions();
    updateVehicleInfo();
  });

  document.getElementById('fuel-select').addEventListener('change', e => {
    state.fuel = e.target.value;
    state.fuelPrice = FUEL_REFERENCE_PRICE[state.fuel];
    document.getElementById('fuel-price').value = state.fuelPrice.toFixed(2);
    localStorage.setItem('taxirota.fuel', state.fuel);
    localStorage.setItem('taxirota.fuelPrice', state.fuelPrice);
    updateVehicleInfo();
  });

  document.getElementById('fuel-price').addEventListener('input', e => {
    state.fuelPrice = parseFloat(e.target.value) || 0;
    localStorage.setItem('taxirota.fuelPrice', state.fuelPrice);
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
  document.getElementById('btn-save-passenger').addEventListener('click', savePassengerFromForm);
  document.getElementById('btn-clear').addEventListener('click', clearAll);
  document.getElementById('btn-calculate').addEventListener('click', calculateRoute);
  document.getElementById('btn-accept').addEventListener('click', acceptAndStartNavigation);
  document.getElementById('btn-3d').addEventListener('click', toggle3D);
  document.getElementById('btn-recenter').addEventListener('click', recenter);
  document.getElementById('btn-locate').addEventListener('click', locateMe);
  document.getElementById('btn-stop-nav').addEventListener('click', stopNavigation);

  // marca botão 3D como ativo
  document.getElementById('btn-3d').classList.add('active');

  // Autocomplete de endereços
  bindAddressAutocomplete('input-pickup', 'sugg-pickup', 'pickup');
  bindAddressAutocomplete('input-dropoff', 'sugg-dropoff', 'dropoff');

  // Tenta usar GPS logo na abertura
  tryAutoLocate();
}

function clearAll() {
  if (!confirm('Limpar todos os passageiros e a rota?')) return;
  state.passengers = [];
  state.draft = { pickup: null, dropoff: null };
  state.route = null;
  state.osrmGeometry = null;
  state.osrmSteps = [];
  document.getElementById('input-pickup').value = '';
  document.getElementById('input-dropoff').value = '';
  document.getElementById('input-pickup').classList.remove('valid');
  document.getElementById('input-dropoff').classList.remove('valid');
  renderPassengers();
  clearRouteOnMap();
  clearPassengerMarkers();
  document.getElementById('route-summary').classList.add('hidden');
  document.getElementById('btn-calculate').disabled = true;
  document.getElementById('btn-save-passenger').disabled = true;
  setStatus('Pronto para embarcar');
}

// =============== Busca de endereços (Nominatim) ===============
function bindAddressAutocomplete(inputId, suggId, kind) {
  const input = document.getElementById(inputId);
  const sugg  = document.getElementById(suggId);
  let debounceT = null;
  let lastQuery = '';

  input.addEventListener('input', () => {
    const q = input.value.trim();
    input.classList.remove('valid');
    state.draft[kind] = null;
    updateSaveButton();

    clearTimeout(debounceT);
    if (q.length < 3) { sugg.classList.remove('show'); sugg.innerHTML = ''; return; }
    if (q === lastQuery) return;
    lastQuery = q;

    input.classList.add('loading');
    debounceT = setTimeout(async () => {
      try {
        const results = await geocodeAddress(q);
        input.classList.remove('loading');
        renderSuggestions(sugg, results, result => {
          input.value = result.displayName;
          input.classList.add('valid');
          sugg.classList.remove('show');
          state.draft[kind] = {
            lng: result.lng, lat: result.lat, label: result.displayName
          };
          updateSaveButton();
          // centraliza mapa no endereço
          state.map.flyTo({ center: [result.lng, result.lat], zoom: 15, pitch: 55, duration: 800 });
        });
      } catch (err) {
        input.classList.remove('loading');
        console.warn('Geocode falhou:', err);
        sugg.innerHTML = '<div class="addr-suggestion-item empty">Não foi possível buscar agora.</div>';
        sugg.classList.add('show');
      }
    }, 350);
  });

  // fecha sugestões ao clicar fora
  document.addEventListener('click', e => {
    if (!sugg.contains(e.target) && e.target !== input) {
      sugg.classList.remove('show');
    }
  });
  input.addEventListener('focus', () => {
    if (sugg.innerHTML) sugg.classList.add('show');
  });
}

async function geocodeAddress(query) {
  // Viés para o Brasil + proximidade do taxista
  const v = state.driverLocation;
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '6',
    countrycodes: 'br',
    'accept-language': 'pt-BR',
    viewbox: `${v.lng - 0.5},${v.lat + 0.5},${v.lng + 0.5},${v.lat - 0.5}`,
    bounded: '0',
  });
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return data.map(r => ({
    lng: parseFloat(r.lon),
    lat: parseFloat(r.lat),
    displayName: formatDisplay(r),
    address: r.address || {},
  }));
}

function formatDisplay(r) {
  const a = r.address || {};
  const road = [a.road, a.house_number].filter(Boolean).join(', ');
  const neigh = a.suburb || a.neighbourhood || a.city_district || '';
  const city = a.city || a.town || a.village || a.municipality || '';
  const uf = a.state_code || a.state || '';
  const parts = [road, neigh, city, uf].filter(Boolean);
  return parts.join(' - ') || r.display_name;
}

function renderSuggestions(container, results, onPick) {
  container.innerHTML = '';
  if (results.length === 0) {
    container.innerHTML = '<div class="addr-suggestion-item empty">Nenhum endereço encontrado.</div>';
    container.classList.add('show');
    return;
  }
  results.forEach(r => {
    const div = document.createElement('div');
    div.className = 'addr-suggestion-item';
    const parts = r.displayName.split(' - ');
    div.innerHTML = `<span class="sug-main">${parts[0]}</span>
      <span class="sug-sub">${parts.slice(1).join(' · ')}</span>`;
    div.addEventListener('click', () => onPick(r));
    container.appendChild(div);
  });
  container.classList.add('show');
}

function updateSaveButton() {
  const can = state.draft.pickup && state.draft.dropoff && state.passengers.length < 4;
  document.getElementById('btn-save-passenger').disabled = !can;
}

function savePassengerFromForm() {
  if (state.passengers.length >= 4) {
    alert('Máximo de 4 passageiros por corrida.');
    return;
  }
  if (!state.draft.pickup || !state.draft.dropoff) return;

  const id = 'p' + Date.now();
  const passenger = {
    id,
    name: 'Passageiro ' + (state.passengers.length + 1),
    color: PAX_COLORS[state.passengers.length],
    pickup: state.draft.pickup,
    dropoff: state.draft.dropoff,
  };
  state.passengers.push(passenger);

  // limpa formulário
  state.draft = { pickup: null, dropoff: null };
  document.getElementById('input-pickup').value = '';
  document.getElementById('input-dropoff').value = '';
  document.getElementById('input-pickup').classList.remove('valid');
  document.getElementById('input-dropoff').classList.remove('valid');
  updateSaveButton();

  renderPassengers();
  renderPassengerMarkers();
  document.getElementById('btn-calculate').disabled = false;

  const remaining = 4 - state.passengers.length;
  setStatus(passenger.name + ' adicionado. ' + (remaining > 0 ? `Pode adicionar mais ${remaining}.` : 'Capacidade máxima.'));

  // fit bounds
  const bounds = new maplibregl.LngLatBounds();
  state.passengers.forEach(p => {
    bounds.extend([p.pickup.lng, p.pickup.lat]);
    bounds.extend([p.dropoff.lng, p.dropoff.lat]);
  });
  bounds.extend([state.driverLocation.lng, state.driverLocation.lat]);
  state.map.fitBounds(bounds, { padding: 80, pitch: 55, duration: 900 });
}

function tryAutoLocate() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    state.driverLocation = { lng: pos.coords.longitude, lat: pos.coords.latitude };
    if (driverMarker) driverMarker.setLngLat([state.driverLocation.lng, state.driverLocation.lat]);
    state.map.flyTo({
      center: [state.driverLocation.lng, state.driverLocation.lat],
      zoom: 14, pitch: 55, duration: 1200,
    });
  }, () => {}, { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
}

// =============== Renderização de passageiros ===============
function renderPassengers() {
  const list = document.getElementById('passenger-list');
  list.innerHTML = '';
  state.passengers.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'passenger-item';
    const pickupLabel = p.pickup.label || fmtCoord(p.pickup);
    const dropoffLabel = p.dropoff.label || fmtCoord(p.dropoff);
    li.innerHTML = `
      <span class="pax-avatar" style="background:${p.color}">${i + 1}</span>
      <div class="pax-details">
        <div class="pax-name">${p.name}</div>
        <div class="pax-route"><span class="from">A</span> ${escapeHtml(pickupLabel)}</div>
        <div class="pax-route"><span class="to">B</span> ${escapeHtml(dropoffLabel)}</div>
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
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
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
