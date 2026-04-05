# TáxiRota — Central do Taxista

**Solução profissional de táxi compartilhado** com logística inteligente, mapa 3D em alta tecnologia e navegação por voz em português do Brasil.

O aplicativo foi desenhado para o **perfil do taxista brasileiro**: interface grande, limpa, branco com detalhes azul-escuro, sem cara de "IA". Basta tocar no mapa para adicionar passageiros e o sistema calcula a melhor distribuição.

---

## Pesquisa de demanda

O táxi compartilhado (ride-pooling) tem crescido no Brasil porque:

- **Passageiro economiza** até 40% em relação ao táxi individual.
- **Motorista ganha mais por km rodado** ao combinar várias corridas na mesma viagem.
- **Menos carros nas ruas** → menos trânsito e menos emissão.
- Modelo já adotado por UberPool, 99Juntos e cooperativas municipais.

### Dores que este app resolve

| Dor do taxista | Como o TáxiRota resolve |
|---|---|
| "Não sei a ordem que devo pegar e deixar os passageiros" | Motor de otimização testa todas as combinações válidas e escolhe a de menor distância |
| "Quanto vou gastar de gasolina?" | Cálculo em tempo real: km × consumo do seu carro × preço do combustível |
| "Meu GPS é confuso demais" | HUD grande, voz em PT-BR, mapa 3D apontando rua por rua |
| "Não posso ficar digitando endereço" | Toque no mapa para marcar embarque e desembarque |
| "Tenho medo de passar do limite legal" | Sistema respeita os **4 passageiros** máximos |

---

## Como funciona

### 1. Seu carro
O motorista escolhe entre **18 modelos populares de táxi no Brasil** (Onix, HB20, Cronos, Voyage, Corolla, Etios, Logan, Siena, Virtus, Spin, Doblò, vans Sprinter/Master, etc.) com o consumo real (km/L) medido pelo INMETRO.

Seleciona o combustível (**gasolina / etanol / diesel**) e ajusta o preço do litro conforme o posto onde abastece.

O sistema mostra automaticamente o **custo por km** do veículo:

```
custo/km = preço do litro ÷ consumo (km/L)
```

### 2. Passageiros (até 4)
Para cada passageiro, o motorista toca duas vezes no mapa:
1. Ponto de **embarque** (verde)
2. Ponto de **desembarque** (azul)

Pode adicionar até **4 passageiros** (8 paradas).

### 3. Rota inteligente
Ao tocar em **CALCULAR MELHOR ROTA**, o sistema:

1. Enumera todas as sequências válidas de paradas (até 2.520 combinações para 4 passageiros).
2. Respeita as restrições:
   - Embarque sempre antes do desembarque do mesmo passageiro.
   - Nunca mais de 4 passageiros simultaneamente no carro.
3. Seleciona a sequência de menor distância total.
4. Chama o roteador OSRM para obter o traçado real rua a rua.
5. Calcula custo de combustível, tempo estimado e mostra **por que** aquela ordem foi escolhida.

### 4. Aceitar e navegar
Ao aceitar, o **HUD de navegação** ativa com:
- Distância até a próxima manobra (fonte grande)
- Instrução por voz em PT-BR ("Vire à direita na Rua das Flores")
- Próxima parada (embarcar / desembarcar quem)
- Distância restante total

O mapa 3D inclina para visão de direção e acompanha o trajeto rua por rua.

---

## Tecnologia

| Camada | Tecnologia |
|---|---|
| Mapa 3D | **MapLibre GL JS 4.7** com estilo Liberty (OpenFreeMap) + edifícios 3D |
| Roteamento | **OSRM** (Open Source Routing Machine) — traçado real em ruas |
| Voz | **Web Speech API** (SpeechSynthesis) nativa PT-BR |
| Otimização | Motor próprio em JS — enumeração exaustiva com precedência |
| UI | HTML + CSS puros (sem frameworks) — carrega em segundos |

Sem dependência de chaves de API pagas. Totalmente gratuito e aberto.

---

## Rodando localmente

Não precisa build. Basta abrir `index.html` em um servidor HTTP simples:

```bash
# qualquer servidor estático serve
python3 -m http.server 8080
# abra http://localhost:8080
```

> Observação: a voz e a geolocalização só funcionam via `http://localhost` ou HTTPS.

---

## Arquivos

```
index.html       → estrutura da interface
styles.css       → design branco/azul-escuro limpo e profissional
app.js           → lógica principal, mapa, voz, navegação
logistics.js     → motor de otimização de rotas com justificativa
vehicles.js      → banco de 18 veículos + preços de referência
```
