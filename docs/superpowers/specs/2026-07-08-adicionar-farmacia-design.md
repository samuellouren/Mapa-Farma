# Adicionar farmácia manualmente — Design / Spec

**Data:** 2026-07-08
**Status:** aprovado
**Contexto:** feature prevista na spec geral (`2026-07-07-mapa-farma-design.md`,
seção 6: `POST /farmacias`) — cadastro manual de farmácia que não veio do
Overpass/CNES. A rota `POST /farmacias` e o `api.criarFarmacia` do client já
existem; o trabalho é a UI no mapa e a validação geográfica no backend.

## Decisões travadas (com o usuário, 2026-07-08)

1. **Ajuste de coordenada só por campos editáveis.** Lat/lng chegam
   preenchidos (long press ou centro do mapa) e podem ser digitados. O modo
   "tocar no mapa pra ajustar" ficou FORA do escopo (o long press já cobre
   "apontar no mapa"; o modo pick pode entrar depois).
2. **Polígono de Maceió commitado em arquivo.** A validação do backend usa um
   GeoJSON salvo no repositório — sem dependência do Nominatim em runtime.

## Backend

### Módulo compartilhado `server/src/lib/limite-maceio.js`
- Carrega `server/src/lib/maceio-limite.json` (GeoJSON Polygon/MultiPolygon do
  município, commitado) e exporta `dentroDeMaceio(lng, lat)` — o mesmo
  point-in-polygon (ray casting) hoje embutido no `seed/cnes.js`.
- Se o JSON faltar/estiver corrompido: warn + fallback pra bounding box
  `lat ∈ [-9.72, -9.38], lng ∈ [-35.80, -35.60]` (nunca lançar).

### Script `npm run limite:atualizar` (`server/src/scripts/atualizar-limite.js`)
- Baixa o polígono de Maceió do Nominatim (`polygon_geojson=1`, User-Agent
  identificável) e regrava `maceio-limite.json`.
- Roda uma vez agora pra gerar o arquivo; depois só se o limite mudar.

### `seed/cnes.js` refatorado
- Passa a importar `dentroDeMaceio` do módulo compartilhado; remove a busca ao
  Nominatim em runtime e o point-in-polygon duplicado.

### Validação no `POST /farmacias` (routes/farmacias.js)
- `nome`: obrigatório, trim não-vazio → senão 400.
- `latitude`/`longitude`: numéricos finitos → senão 400.
- `dentroDeMaceio(longitude, latitude)` → senão
  400 `{ erro: 'Coordenada fora dos limites de Maceió' }`.
- INSERT inalterado (defaults do schema: `eh_cliente = false`,
  `status_visita = 'nao_visitada'`).

## Client (tela Mapa existente — sem tela nova)

### Entradas do formulário
- **FAB "+"**: botão flutuante vinho, canto inferior direito, empilhado acima
  do botão "minha localização", sempre visível. Usa o **centro atual do mapa**
  como coordenada padrão (novo `ref` no `<Map>` → `getCenter()`).
- **Long press** no mapa (`onLongPress`): abre o mesmo formulário com o
  `lngLat` do ponto tocado já preenchido.

### Componente novo `client/src/components/NovaFarmaciaSheet.js`
- Mesmo padrão visual do `FiltroSheet` (Modal `transparent` + `slide`,
  backdrop, puxador, título, botão vinho), com `KeyboardAvoidingView`.
- Campos: **Nome*** · Endereço · Bairro · **Latitude** · **Longitude**
  (teclado numérico, aceita vírgula ou ponto).
- Validação client-side (feedback imediato): nome obrigatório; lat/lng
  parseáveis e dentro da bbox de Maceió. O polígono fino é autoridade do
  servidor — o 400 do servidor aparece como erro dentro do sheet.
- Botão "Salvar farmácia" com estado de carregando; erros não fecham o sheet.

### Pós-salvar
- A linha retornada pelo POST entra direto no estado `farmacias` → o marcador
  branco (não-cliente, status padrão) aparece sem recarregar.
- A câmera voa até a farmácia nova e ela abre selecionada
  (BottomSheetFarmacia), confirmando visualmente onde caiu.

## Testes
- `node --test` no server (novo script `npm test`), zero dependência nova:
  unit de `dentroDeMaceio` com pontos conhecidos — centro de Maceió (dentro),
  Lagoa Mundaú (fora), Rio Largo (fora), litoral norte (fora) e Benedito
  Bentes (dentro — o caso que a bbox retangular classificava errado).
- Rota validada manualmente via curl (sem supertest, pra não somar deps).

## Fora de escopo
- Modo "tocar no mapa pra ajustar" a coordenada (long press cobre o caso).
- Editar/excluir farmácia pela UI (só criação).
- Deduplicação no POST manual (a equipe enxerga o mapa; duplicata visível).
