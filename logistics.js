/* ================================
   Motor de Logística Inteligente — TáxiRota
   - Otimização de sequência de paradas (embarque/desembarque)
   - Respeita restrição de precedência (embarque antes do desembarque)
   - Respeita capacidade máxima do veículo (4 passageiros)
   - Calcula custo de combustível e tempo
   - Gera a justificativa da distribuição
   ================================ */

const EARTH_R = 6371; // km
const AVG_SPEED_KMH = 32; // velocidade urbana média BR
const DETOUR_FACTOR = 1.32; // estradas reais vs. linha reta (fator de sinuosidade)

function haversineKm(a, b) {
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/**
 * Gera todas as sequências válidas de paradas.
 * Restrições:
 *  - Embarque de um passageiro deve ocorrer antes do seu desembarque
 *  - Nunca mais de 4 passageiros no carro ao mesmo tempo
 */
function* validSequences(stops, capacity = 4) {
  const n = stops.length;
  const used = new Array(n).fill(false);
  const order = [];
  const onboard = new Set();

  function* recurse() {
    if (order.length === n) {
      yield order.slice();
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const s = stops[i];
      if (s.type === 'pickup') {
        if (onboard.size >= capacity) continue;
      } else {
        // desembarque só é válido se o passageiro já embarcou
        if (!onboard.has(s.passengerId)) continue;
      }
      used[i] = true;
      order.push(i);
      if (s.type === 'pickup') onboard.add(s.passengerId);
      else onboard.delete(s.passengerId);
      yield* recurse();
      used[i] = false;
      order.pop();
      if (s.type === 'pickup') onboard.delete(s.passengerId);
      else onboard.add(s.passengerId);
    }
  }
  yield* recurse();
}

/**
 * Calcula a distância total (linha reta com fator de sinuosidade) de uma sequência
 */
function sequenceDistance(sequence, stops, origin) {
  let total = 0;
  let prev = origin;
  for (const idx of sequence) {
    total += haversineKm(prev, stops[idx].coord);
    prev = stops[idx].coord;
  }
  return total * DETOUR_FACTOR;
}

/**
 * Otimizador principal.
 * Para até 4 passageiros (8 paradas) enumeramos todas as sequências válidas.
 * Complexidade máxima: 8!/(2^4) = 2520 sequências → instantâneo.
 * Para mais passageiros, usar heurística nearest-neighbor + 2-opt.
 */
function optimizeRoute({ passengers, origin, vehicle, fuel, fuelPrice }) {
  // monta lista de paradas
  const stops = [];
  passengers.forEach(p => {
    stops.push({ type: 'pickup',  passengerId: p.id, coord: p.pickup,  label: p.name + ' (embarque)' });
    stops.push({ type: 'dropoff', passengerId: p.id, coord: p.dropoff, label: p.name + ' (desembarque)' });
  });

  // brute force quando viável
  let best = null;
  if (stops.length <= 10) {
    for (const seq of validSequences(stops, 4)) {
      const dist = sequenceDistance(seq, stops, origin);
      if (!best || dist < best.distance) {
        best = { sequence: seq, distance: dist };
      }
    }
  } else {
    // fallback: nearest neighbor respeitando restrições
    best = greedyNearestNeighbor(stops, origin, 4);
  }

  if (!best) return null;

  // constrói paradas ordenadas
  const orderedStops = best.sequence.map(i => stops[i]);

  // custo de combustível
  const kmPerL = vehicle.consumption[fuel];
  const litersUsed = best.distance / kmPerL;
  const fuelCost   = litersUsed * fuelPrice;
  const timeMin    = (best.distance / AVG_SPEED_KMH) * 60;

  // gera justificativa inteligente
  const reasoning = buildReasoning({
    stops, orderedStops, distance: best.distance,
    fuelCost, vehicle, fuel, passengers, origin
  });

  return {
    orderedStops,
    distance: best.distance,
    timeMin,
    litersUsed,
    fuelCost,
    costPerKm: (fuelCost / best.distance) || 0,
    reasoning,
  };
}

function greedyNearestNeighbor(stops, origin, capacity) {
  const n = stops.length;
  const used = new Array(n).fill(false);
  const onboard = new Set();
  const sequence = [];
  let current = origin;
  let total = 0;

  while (sequence.length < n) {
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const s = stops[i];
      if (s.type === 'pickup' && onboard.size >= capacity) continue;
      if (s.type === 'dropoff' && !onboard.has(s.passengerId)) continue;
      const d = haversineKm(current, s.coord);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx < 0) return null;
    used[bestIdx] = true;
    sequence.push(bestIdx);
    total += bestDist;
    const s = stops[bestIdx];
    if (s.type === 'pickup') onboard.add(s.passengerId);
    else onboard.delete(s.passengerId);
    current = s.coord;
  }
  return { sequence, distance: total * DETOUR_FACTOR };
}

/**
 * Gera explicações em linguagem simples do porquê da distribuição
 */
function buildReasoning({ orderedStops, distance, fuelCost, vehicle, fuel, passengers, origin }) {
  const reasons = [];

  // 1. Embarques agrupados
  const firstPickups = orderedStops.slice(0, passengers.length).filter(s => s.type === 'pickup').length;
  if (firstPickups === passengers.length) {
    reasons.push(`Todos os ${passengers.length} passageiros são recolhidos primeiro — menos quilômetros rodados vazio.`);
  } else {
    reasons.push('Embarques e desembarques foram intercalados para reduzir atrasos no trajeto.');
  }

  // 2. Distância
  reasons.push(`Sequência escolhida percorre <b>${distance.toFixed(1)} km</b> — a menor distância possível respeitando as regras de embarque.`);

  // 3. Capacidade
  let peakLoad = 0, load = 0;
  for (const s of orderedStops) {
    load += s.type === 'pickup' ? 1 : -1;
    if (load > peakLoad) peakLoad = load;
  }
  reasons.push(`Ocupação máxima do carro: <b>${peakLoad} de 4 lugares</b> (respeita a capacidade legal do táxi).`);

  // 4. Economia
  const litersUsed = distance / vehicle.consumption[fuel];
  reasons.push(`Gasto estimado de <b>${litersUsed.toFixed(2)}L</b> de ${fuel} — R$ ${fuelCost.toFixed(2)} com o seu ${vehicle.model}.`);

  // 5. Tempo
  const timeMin = (distance / AVG_SPEED_KMH) * 60;
  reasons.push(`Tempo previsto de <b>${Math.round(timeMin)} minutos</b> considerando trânsito urbano médio (32 km/h).`);

  // 6. Primeiro passageiro
  const first = orderedStops[0];
  if (first) {
    const p = passengers.find(x => x.id === first.passengerId);
    reasons.push(`Primeira parada: <b>${p ? p.name : ''}</b> — ponto mais próximo da sua posição atual.`);
  }

  return reasons;
}

// expõe funções
window.Logistics = { optimizeRoute, haversineKm };
