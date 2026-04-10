# Projeto TáxiRota — Central do Taxista

## O que é
App de táxi compartilhado (ride-pooling) para taxistas brasileiros. Web app estático (HTML/CSS/JS puro) sem backend. Hospedado no GitHub Pages.

## URL de produção
https://videon8n.github.io/Pelo-celular-/

## Branches
- Desenvolvimento: `claude/ride-sharing-logistics-app-STSlo`
- Deploy (Pages): `gh-pages` — precisa sincronizar manualmente os arquivos do branch de dev
- Após editar qualquer arquivo, sempre fazer deploy no `gh-pages`: checkout gh-pages → copiar arquivos → commit → push → voltar para branch dev

## Arquitetura (6 arquivos)
- `index.html` — estrutura da interface, 3 passos: carro → passageiros → rota
- `styles.css` — design branco limpo com azul-escuro (#0b2545), responsivo mobile
- `app.js` — lógica principal: mapa 3D (MapLibre GL + OpenFreeMap Liberty), voz PT-BR (Web Speech API), navegação com animação do carro, GPS ao vivo (watchPosition), autocomplete de endereços (Nominatim), localStorage para persistência
- `logistics.js` — motor de otimização de rotas: enumera todas sequências válidas (até 2520 para 4 passageiros), respeita precedência embarque→desembarque e capacidade 4 lugares, gera justificativa em PT-BR
- `vehicles.js` — banco de 18 veículos populares BR com consumo km/L real (gasolina/etanol/diesel)
- `.github/workflows/deploy-pages.yml` — CI/CD GitHub Actions

## Tecnologias externas (CDN, sem chave de API)
- MapLibre GL JS 4.7 — mapa 3D
- OpenFreeMap Liberty — tiles de mapa gratuitos
- OSRM (router.project-osrm.org) — roteamento rua-a-rua, fallback para haversine
- Nominatim (nominatim.openstreetmap.org) — geocoding de endereços, viés Brasil

## Design
- Público-alvo: taxistas brasileiros com baixa familiaridade tecnológica
- Estilo: branco limpo com detalhes azul-escuro (#0b2545), sem cara de IA
- Fontes grandes, botões grandes, touch targets mínimo 44px
- Mobile-first: painel lateral colapsa durante navegação (body.is-navigating)
- Navegação: carro percorre rota no mapa com câmera acompanhando por trás (pitch 65°, zoom 17, bearing alinhado à direção)

## Funcionalidades principais
1. Seleção de veículo + combustível + preço por litro → custo/km automático
2. Busca de endereço com autocomplete (Nominatim) para embarque e desembarque
3. Até 4 passageiros por corrida
4. Otimização inteligente da ordem das paradas com justificativa
5. Mapa 3D com rota traçada (OSRM) e marcadores coloridos
6. Navegação guiada por voz em PT-BR com animação do carro no mapa
7. GPS ao vivo (watchPosition, enableHighAccuracy: true)
8. Persistência de configs em localStorage
