# Notificações + resumo diário + Painel "nunca visitada por distância" — Design

**Data:** 2026-07-12

## Goal

Transformar os toggles locais sem função (hoje só AsyncStorage) num sistema real de
notificações push, com um digest matinal de alertas e um resumo diário por vendedor, e
adicionar ao Painel um card de farmácias **nunca visitadas ordenadas por proximidade** do
vendedor.

## Contexto / estado atual

- App React Native (Expo SDK 57) + backend Express/libSQL (SQLite). Banco único
  compartilhado pelo time (3-5 vendedores, mesma visibilidade, sem papéis).
- `expo-location` e AsyncStorage instalados; **`expo-notifications`/`expo-device` NÃO**.
- **Sem scheduler** no servidor (dependência nova). Próxima migration: `003`.
- Ver [[mapafarma-dev-server-restart]]: `npm start` não tem `--watch` — reiniciar o
  servidor após mudanças de backend.
- Descoberta: `stats.js` hoje joga farmácias nunca-visitadas pro topo de "sem visita há
  mais tempo" (null → `1e9` no sort). Este design separa esse conceito.

## Decisões travadas (brainstorming 2026-07-12)

1. **Alvo dos alertas (tipos 1-3):** broadcast (todos os vendedores).
2. **Resumo diário:** por vendedor (números individuais do dia).
3. **Formato dos alertas:** um digest diário (snapshot), não notificação por evento →
   **sem coluna de dedup**.
4. **Preferências:** por-usuário no banco; o cron consulta antes de enviar.
5. **`data_vencimento`:** input opcional adicionado agora no NovoPedidoSheet.
6. **Painel:** card novo separado; "Sem visita há mais tempo" passa a excluir
   nunca-visitadas.
7. **GPS negado no Painel:** pede permissão ao focar; se negar, esconde o card + linha
   "Ative a localização…".
8. **Horários:** digest **08h00**; resumo **22h30**. Timezone **America/Maceio**.
9. **Limiar "sem visita":** 30 dias. **Top N** do card de distância: 5.

## Escopo

**Inclui:** migration 003; infra de push (deps, token por usuário, prefs); endpoints de
prefs/token; digest de alertas + resumo diário via cron; input de `data_vencimento`;
Conta com toggles reais; card de distância no Painel + ajuste do card existente; testes.

**Não inclui (YAGNI / futuro):** deep-link ao tocar na notificação (abre o app e pronto);
histórico de notificações enviadas; agrupamento/quiet-hours configuráveis; push em
produção hospedada (o funcionamento pleno com app fechado exige backend sempre ativo —
testado localmente por ora).

---

## 1. Schema — migration `003_notificacoes.sql`

```sql
ALTER TABLE pedidos  ADD COLUMN data_vencimento date;               -- null nos pedidos antigos
ALTER TABLE usuarios ADD COLUMN expo_push_token  text;              -- null até o device registrar
ALTER TABLE usuarios ADD COLUMN notif_alertas    integer DEFAULT 1; -- recebe o digest das 8h
ALTER TABLE usuarios ADD COLUMN notif_resumo     integer DEFAULT 1; -- recebe o resumo das 22h30
```

Sem tabela/coluna de "já notificado": o digest é recalculado do estado atual a cada
disparo.

## 2. Infra de push

**Dependências novas:**
- Client: `expo-notifications`, `expo-device` (via `expo install`, versões do SDK 57).
- Server: `expo-server-sdk` (envio com chunking/receipts), `node-cron` (agendamento).

**Registro de token (client):** ao autenticar (login ou abertura com token válido) e em
device físico (`Device.isDevice`), solicita permissão de notificação; se concedida, obtém
o Expo push token via `getExpoPushTokenAsync({ projectId })` e envia ao servidor. Sem
permissão/sem device → segue sem push (degradação suave, sem erro).
- **Pré-requisito a verificar na implementação:** `app.json` precisa de
  `expo.extra.eas.projectId` (vem do EAS). Se ausente, configurar antes.

**Endpoints (router `/auth`):**
- `GET /auth/me` — passa a devolver também `notif_alertas`, `notif_resumo` (0/1) e
  `tem_push_token` (bool), pra Conta refletir o estado real.
- `PATCH /auth/me` — aceita `{ expo_push_token?, notif_alertas?, notif_resumo? }` (todos
  opcionais; grava só o que vier). Valida booleanos como 0/1.

## 3. Lógica das notificações

Módulo isolado `server/src/notificacoes/`:
- `dados.js` — funções de consulta puras (recebem `db`): números do digest e do resumo.
- `mensagens.js` — monta os textos a partir dos números.
- `destinatarios.js` — seleciona usuários por pref + token.
- `envio.js` — wrapper do `expo-server-sdk` (interface `enviar(mensagens)`); o resto do
  código não conhece o SDK, o que permite testar `dados`/`mensagens`/`destinatarios` sem
  push real.
- `agenda.js` — registra os dois cron jobs; chamado no start do servidor (`index.js`).

### A) Digest de alertas — 08h00, broadcast

Destinatários: usuários com `notif_alertas = 1` **e** `expo_push_token` não-nulo.

Números (snapshot atual, all-time):
- **Tipo 1 — sem visita há +30d:** farmácias **com** pelo menos um `relatorios_visita`
  cuja última visita (`MAX(data_visita)`) é anterior a `date('now','-30 days')`.
  *Nunca-visitadas ficam FORA* (a maioria da base nunca foi visitada — inflaria o número;
  elas vão pro card de distância do Painel).
- **Tipo 2 — pagamento ruim:** farmácias com `perfil_pagamento_efetivo` (helper
  `sqlPerfilEfetivo`, manual-ou-pedido) em `atrasa` ou `nao_paga`.
- **Tipo 3 — pedido vencido:** pedidos com `data_vencimento < date('now')` **e**
  `status_pagamento != 'pago'`.

Mensagem (só os itens > 0), ex.: *"☀️ 3 sem visita há +30d · 2 em atraso · 1 pedido
vencido"*. **Se os três forem 0, não envia nada.**

### B) Resumo diário — 22h30, por vendedor

Destinatários: cada usuário com `notif_resumo = 1` **e** `expo_push_token` não-nulo,
recebendo os **próprios** números do dia (`date('now')`, timezone do servidor):
- visitas registradas por ele (`relatorios_visita` onde `usuario_id = me` e
  `data_visita = hoje`);
- pedidos criados por ele (`pedidos` onde `usuario_id = me` e `data_pedido = hoje`);
- total vendido por ele hoje (`SUM(valor_centavos)` desses pedidos).

Mensagem, ex.: *"📋 Seu dia: 5 visitas · 3 pedidos · R$ 1.250 vendido"*. **Sem atividade
no dia (tudo 0) → não envia** pra esse usuário.

## 4. Agendamento

`node-cron` iniciado no start do servidor, com `timezone: 'America/Maceio'`:
- `0 8 * * *`  → digest de alertas.
- `30 22 * * *` → resumo diário.

Limitação registrada: em dev (`npm start`) o cron só roda enquanto o processo está vivo;
funcionamento pleno (todo dia, com o app fechado) exige o backend hospedado e sempre
ativo.

**Fuso nas queries de data (corretude):** `date('now')` do SQLite é **UTC**. Às 22h30 em
Maceió (UTC-3) já é 01h30 UTC do dia seguinte — um `data_pedido = date('now')` cru pegaria
o dia errado no resumo. Maceió não tem horário de verão, então todas as comparações de
"hoje"/"-30 dias" nas queries usam offset fixo: `date('now','-3 hours')`. Vale para o
resumo (dia atual), o tipo 1 (`-30 days` a partir de `now,-3 hours`) e o tipo 3
(`data_vencimento < date('now','-3 hours')`).

## 5. Client

- **Conta (`ContaScreen`):** os toggles "Notificações" e "Resumo diário" passam a ler de
  `GET /auth/me` (estado do servidor) e gravar via `PATCH /auth/me` — saem do AsyncStorage
  puro. Mapeamento: "Notificações" → `notif_alertas`; "Resumo diário" → `notif_resumo`.
- **NovoPedidoSheet:** campo **opcional** de data de vencimento (criar e editar) →
  `data_vencimento`. Confirmar o padrão de seleção de data já usado no app; provável nova
  dep `@react-native-community/datetimepicker` (via `expo install`).
- **Registro de token:** feito no fluxo de auth (ver §2), sem bloquear o uso do app.

**Backend de pedidos (para o input funcionar):** `POST /pedidos` e `PATCH /pedidos/:id`
aceitam e validam `data_vencimento` (date `YYYY-MM-DD` ou null); `GET /pedidos` passa a
retornar `data_vencimento` (pra pré-preencher a edição).

## 6. Adendo do Painel

**Server (`/stats`):**
- Novo campo `nunca_visitadas`: farmácias com `NOT EXISTS (SELECT 1 FROM relatorios_visita
  WHERE farmacia_id = f.id)` e com `latitude`/`longitude` não-nulos (`id, nome, bairro,
  latitude, longitude`). Independente do `periodo`. Payload pequeno (base ~105).
- `sem_visita_ha_mais_tempo` passa a **excluir** nunca-visitadas (filtra
  `ultima_visita IS NOT NULL`) → vira "visitadas há mais tempo", ordenado por dias.

**Client (`PainelScreen`) — card novo separado:**
- Ao focar o Painel, obtém localização (mesmo padrão do `MapaScreen`: `getLastKnownPosition`
  + fix atual, com `coordValida`).
- Ordena `nunca_visitadas` por `distanciaMetros` (Haversine do `hitTest.js`), mostra **top
  5** com distância em km.
- Função pura nova (testável), ex.: `farmaciasMaisProximas(lista, lat, lng, n)` em
  `lib/hitTest.js` ou `lib/proximidade.js`.
- GPS negado/indisponível → esconde o card e mostra a linha "Ative a localização para ver
  farmácias próximas" (pede permissão ao focar; se negar, cai nesse estado).
- Título do card existente ajustado para refletir "visitadas há mais tempo".

## 7. Testes

- **Server (`node:test`, padrão `stats.perfil.test.js`):**
  - `notificacoes.test.js` — números do digest (tipos 1-3 com casos de borda:
    nunca-visitada não conta no tipo 1; vencido só se não-pago), números do resumo por
    usuário, e seleção de destinatários (respeita `notif_*` + token nulo).
  - Rotas: `PATCH /auth/me` grava prefs/token; `POST`/`PATCH /pedidos` aceitam
    `data_vencimento`; `/stats` devolve `nunca_visitadas` e exclui nunca-visitadas de
    `sem_visita_ha_mais_tempo`.
- **Client (`*.test.mjs`, padrão `grafico.test.mjs`):** `farmaciasMaisProximas` — ordem por
  distância, corte no top N, ignora sem-coordenada.
- **Manual (device físico):** permissão, chegada do push (digest/resumo), toggles ligando/
  desligando o envio. Ciente da limitação local vs hospedagem.

O envio real (`envio.js`/`expo-server-sdk`) não é testado automatizado (externo); os testes
cobrem os dados, as mensagens e os destinatários.

## 8. Fases de implementação

1. **Migration 003 + `data_vencimento`** (backend pedidos aceita/retorna; input no
   NovoPedidoSheet).
2. **Painel "nunca visitada por distância"** — `/stats.nunca_visitadas` + ajuste do card
   existente + card novo client-side + `farmaciasMaisProximas`. Independente de push.
3. **Infra de push** — deps, registro de token, `GET/PATCH /auth/me` com prefs, Conta com
   toggles reais.
4. **Lógica + cron** — módulo `notificacoes/`, digest 8h, resumo 22h30.

Cada fase é um bloco testável e commit próprio.

## Fronteiras de módulos (resumo)

| Módulo | Faz | Depende de |
|---|---|---|
| `notificacoes/dados.js` | conta números (digest, resumo) | `db`, `sqlPerfilEfetivo` |
| `notificacoes/mensagens.js` | monta textos | números (objetos puros) |
| `notificacoes/destinatarios.js` | seleciona usuários | `db` (prefs + token) |
| `notificacoes/envio.js` | envia push | `expo-server-sdk` |
| `notificacoes/agenda.js` | agenda 8h/22h30 | `node-cron`, os módulos acima |
| client `lib/hitTest.js` | `farmaciasMaisProximas` (puro) | Haversine já existente |
