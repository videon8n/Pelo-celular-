/* ================================
   Banco de veículos com consumo real (km/L)
   Dados médios urbano/estrada para táxis populares no Brasil.
   Fontes: INMETRO PBEV, manuais dos fabricantes.
   ================================ */

const VEHICLES = [
  { id: 'onix-1.0',    model: 'Chevrolet Onix 1.0',       consumption: { gasolina: 12.8, etanol:  8.9 } },
  { id: 'hb20-1.0',    model: 'Hyundai HB20 1.0',         consumption: { gasolina: 12.5, etanol:  8.6 } },
  { id: 'cronos-1.3',  model: 'Fiat Cronos 1.3',          consumption: { gasolina: 13.0, etanol:  9.1 } },
  { id: 'voyage-1.6',  model: 'Volkswagen Voyage 1.6',    consumption: { gasolina: 11.2, etanol:  7.8 } },
  { id: 'corolla-2.0', model: 'Toyota Corolla 2.0',       consumption: { gasolina: 13.2, etanol:  9.3 } },
  { id: 'etios-sedan', model: 'Toyota Etios Sedan 1.5',   consumption: { gasolina: 13.5, etanol:  9.5 } },
  { id: 'logan-1.6',   model: 'Renault Logan 1.6',        consumption: { gasolina: 11.8, etanol:  8.2 } },
  { id: 'prisma-1.4',  model: 'Chevrolet Prisma 1.4',     consumption: { gasolina: 11.9, etanol:  8.3 } },
  { id: 'virtus-1.6',  model: 'Volkswagen Virtus 1.6',    consumption: { gasolina: 12.6, etanol:  8.8 } },
  { id: 'versa-1.6',   model: 'Nissan Versa 1.6',         consumption: { gasolina: 12.2, etanol:  8.5 } },
  { id: 'sandero-1.6', model: 'Renault Sandero 1.6',      consumption: { gasolina: 11.5, etanol:  8.0 } },
  { id: 'yaris-1.5',   model: 'Toyota Yaris 1.5',         consumption: { gasolina: 13.1, etanol:  9.2 } },
  { id: 'siena-1.4',   model: 'Fiat Siena 1.4',           consumption: { gasolina: 12.0, etanol:  8.4 } },
  { id: 'ka-1.5',      model: 'Ford Ka 1.5',              consumption: { gasolina: 12.4, etanol:  8.7 } },
  { id: 'spin-1.8',    model: 'Chevrolet Spin 1.8 (7lug)',consumption: { gasolina: 10.2, etanol:  7.1 } },
  { id: 'doblo-1.8',   model: 'Fiat Doblò 1.8 (7lug)',    consumption: { gasolina:  9.8, etanol:  6.9 } },
  { id: 'kombi-d',     model: 'Van Renault Master Diesel',consumption: { diesel:   10.5 } },
  { id: 'sprinter-d',  model: 'Mercedes Sprinter Diesel', consumption: { diesel:    9.2 } },
];

// Preços médios de referência (abril/2026 - editáveis pelo motorista)
const FUEL_REFERENCE_PRICE = {
  gasolina: 6.19,
  etanol:   4.29,
  diesel:   6.05,
};
