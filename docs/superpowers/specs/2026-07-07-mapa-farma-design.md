# Mapa Farma — Design / Spec

**Data:** 2026-07-07
**Status:** aprovado (design), em implementação
**Revisão 2026-07-07:** frontend deixou de ser PWA (React+Vite) e passou a
ser **app nativo React Native (Expo)** com build `.apk` via EAS. O backend
(`server/`) e o schema (`schema-turso`) não mudaram. Seções 1, 2, 3, 7 e 8
abaixo já refletem a virada.

## 1. Resumo

App de apoio comercial para uma distribuidora de remédios em Maceió/AL,
usado por 3 a 5 vendedores da mesma equipe. Permite mapear farmácias,
registrar visitas, acompanhar pedidos/pagamentos e ver estatísticas da
carteira.

Formato: **app nativo React Native (Expo)**, empacotado como `.apk`
instalável via **EAS Build**. (A abordagem inicial de PWA foi descartada a
pedido do usuário — ele quer um app nativo de verdade, não "adicionar à
tela inicial" pelo navegador.)

O design (`Mapa_Farma.html`, export do Claude Design) é usado como
**referência visual** (cores, espaçamento, tipografia, hierarquia) para
recriar as telas em **componentes nativos** (`View`, `Text`,
`TouchableOpacity`, etc.). O objetivo continua sendo fidelidade visual, não
redesenho — mas via componente nativo, não HTML/CSS portado 1:1.

## 2. Decisões travadas

1. **8 telas** do design serão construídas (inclui Pedidos e Conta).
2. **Mapa real** com **MapLibre** (`@maplibre/maplibre-react-native`) +
   tiles OpenStreetMap, sem Google e sem chave de API; farmácias têm
   latitude/longitude reais (o design usava coordenadas fake x/y em %).
   `react-native-maps` foi descartado por usar Google Maps SDK como base no
   Android.
3. **Login** por email + senha, um usuário por vendedor. Uso interno; sem
   fluxo de recuperação de senha nesta versão.
4. **Data do registro de visita** = data real do sistema no momento do
   registro (o design mostrava data fixa).
5. **"Rota"** abre navegação **externa** (Google Maps / Waze via link), não
   navegação dentro do app.
6. **Origem das farmácias:** carga inicial via **Overpass API** (todas as
   farmácias de Maceió no OpenStreetMap) + equipe pode adicionar/corrigir
   manualmente.
7. **`perfil_pagamento` e `perfil_compra` são manuais** e independentes do
   `status_pagamento` dos pedidos. Cálculo automático do perfil a partir do
   histórico de pedidos é **fase 2**.
8. **Moldura de celular ignorada:** o bezel preto, a status bar "9:41" e a
   barra de gesto do mockup são cromo de mockup — em app nativo nem existem.
   O conteúdo interno de cada tela é recriado fielmente em componentes
   nativos, respeitando safe areas do dispositivo.
10. **Frontend nativo Expo:** React Native via Expo; navegação com
    React Navigation; `.apk` via EAS Build (nuvem). Requer conta Expo
    gratuita.
9. **Banco único compartilhado** por toda a equipe. `usuario_id` indica
   apenas QUEM registrou algo, nunca restringe visibilidade. Todos os
   usuários têm o mesmo nível de acesso (sem coluna de papel/role).

## 3. Arquitetura

Monorepo com dois apps independentes:

- **`client/`** — app nativo React Native (Expo). Recria as telas do design
  em componentes nativos. Fala com o backend por `fetch`. Build `.apk` via
  EAS. Navegação com React Navigation; token JWT em AsyncStorage.
- **`server/`** — Node + Express + `@libsql/client` (Turso/libSQL). API REST
  + autenticação. **Não muda com a virada para nativo.**

Comunicação: REST/JSON. Autenticação por **JWT** (senha com hash bcrypt);
middleware protege as rotas da API. Estatísticas e totais sempre calculados
por query — sem tabelas pré-agregadas.

### Estrutura de pastas

```
MapaFarma/
├── Mapa_Farma.html            ← design de referência (mantido, não editado)
├── docs/superpowers/specs/    ← este documento
├── client/                    ← app nativo (Expo + React Native)
│   ├── app.json               ← config Expo (nome, ícone, splash, package)
│   ├── eas.json               ← perfil de build EAS (gera .apk)
│   ├── App.js                 ← entrada → NavigationContainer
│   ├── assets/                ← ícone, splash, fontes (IBM Plex Mono)
│   └── src/
│       ├── navigation/        ← RootNavigator (auth vs tabs), TabNavigator
│       ├── screens/           ← Login, Mapa, Ficha, Registrar, Historico,
│       │                         Painel, Pedidos, Conta
│       ├── components/        ← BottomSheet, SegmentedControl, Chip, Toast,
│       │                         MapaView, MarcadorFarmacia, TabBar
│       ├── api/               ← client REST (fetch + token)
│       ├── lib/               ← auth/token (AsyncStorage), enums design→banco,
│       │                         formatação (BRL, datas), geolocalização
│       ├── theme/             ← cores (#7a2833…), espaçamento, tipografia
│       └── hooks/
├── server/                    ← API (Node + Express)
│   ├── package.json
│   ├── .env.example           ← TURSO_URL, TURSO_TOKEN, JWT_SECRET
│   └── src/
│       ├── index.js
│       ├── db.js              ← cliente libSQL
│       ├── migrations/        ← SQL versionado (001_init.sql, ...)
│       ├── seed/              ← import Overpass (farmácias de Maceió)
│       ├── middleware/auth.js
│       └── routes/            ← auth, farmacias, relatorios, pedidos, stats
└── README.md
```

## 4. Telas

Barra de abas inferior (4 abas): **Mapa · Pedidos · Painel · Conta**.

1. **Login** (nova, não existe no design; segue o visual vinho/tipografia).
   Email + senha → JWT.
2. **Mapa** — busca por nome/bairro, botão de filtro, legenda
   (Cliente verde / Não-cliente branco), bottom-sheet ao tocar num marcador
   (nome, endereço, chips de relação/visita/pagamento, botões "Rota" e
   "Abrir ficha").
3. **Filtro** (sheet sobre o mapa) — relação (todas/clientes/não-clientes),
   status de visita, perfil de pagamento; contador "Ver N farmácias".
4. **Ficha** — cabeçalho da farmácia, botão "traçar rota", toggle "é
   cliente?", segmented controls de status de visita / perfil de pagamento /
   perfil de compra, botão "Registrar visita", resumo do histórico (2 mais
   recentes + "ver tudo").
5. **Registrar visita** — data (hoje, automática), horário de chegada,
   duração (10/20/30/45 min), observação livre. Salvar marca a farmácia como
   `visitada`.
6. **Histórico** — timeline vertical de todos os relatórios da farmácia.
7. **Painel / Estatísticas** — seletor de período (7/30/90 dias); visitas no
   período; farmácias visitadas; melhores clientes; sem-visita-há-mais-tempo;
   perfil de pagamento da carteira (barra + lista por cliente); visitas por
   vendedor.
8. **Pedidos** — totais (vendido / recebido / a receber); gráfico de vendas
   em R$ (por mês / por semana); lista de pedidos com troca de status inline;
   sheet "Novo pedido" (farmácia, valor, status de pagamento).
9. **Conta** — usuário logado, contadores (farmácias/clientes/pedidos), lista
   da equipe, preferências (notificações, resumo diário — toggles locais),
   "Sair da conta".

## 5. Modelo de dados (Turso / libSQL)

Nomes em português, snake_case. Migrations versionadas.

### `farmacias`
| campo | tipo | obs |
|---|---|---|
| id | integer PK | |
| nome | text | |
| endereco | text | |
| bairro | text | |
| latitude | real | |
| longitude | real | |
| eh_cliente | boolean | default false — cor do marcador |
| status_visita | text | `nao_visitada` \| `a_visitar` \| `visitada` |
| perfil_pagamento | text \| null | `paga_em_dia` \| `atrasa` \| `nao_paga` |
| perfil_compra | text \| null | `compra_bem` \| `compra_pouco` \| `nao_compra` |
| criado_em | datetime | |

### `relatorios_visita`
| campo | tipo | obs |
|---|---|---|
| id | integer PK | |
| farmacia_id | integer FK → farmacias.id | |
| usuario_id | integer FK → usuarios.id | quem registrou |
| data_visita | date | |
| horario_chegada | text | HH:MM |
| duracao_minutos | integer | |
| observacao | text | |
| criado_em | datetime | |

### `usuarios`
| campo | tipo | obs |
|---|---|---|
| id | integer PK | |
| nome | text | |
| email | text unique | |
| senha_hash | text | bcrypt |
| criado_em | datetime | |

Sem coluna de papel/role — todos com o mesmo nível de acesso.

### `pedidos` (nova — não estava na doc da skill schema-turso)
| campo | tipo | obs |
|---|---|---|
| id | integer PK | |
| farmacia_id | integer FK → farmacias.id | |
| usuario_id | integer FK → usuarios.id | quem registrou |
| valor_centavos | integer | dinheiro em centavos (sem float) |
| status_pagamento | text | `pago` \| `atrasado` \| `nao_pago` |
| data_pedido | date | |
| criado_em | datetime | |

> A doc da skill `schema-turso` será atualizada na implementação para
> incluir a tabela `pedidos`, mantendo-a como fonte de verdade do schema.

### Mapeamento design → banco (enums)

O design usa chaves curtas; o banco usa valores verbosos. O frontend traduz.

| conceito | design | banco |
|---|---|---|
| status de visita | `visitada` / `avisitar` / `nao` | `visitada` / `a_visitar` / `nao_visitada` |
| perfil pagamento | `emdia` / `atrasa` / `naopaga` | `paga_em_dia` / `atrasa` / `nao_paga` |
| perfil compra | `bem` / `pouco` / `nao` | `compra_bem` / `compra_pouco` / `nao_compra` |
| status pedido | `pago` / `atrasado` / `naopago` | `pago` / `atrasado` / `nao_pago` |

## 6. API (REST, esboço)

Todas as rotas de dados exigem JWT válido.

- `POST /auth/login` → { token, usuario }
- `GET /auth/me` → usuário logado
- `GET /farmacias` (com filtros: busca, relação, visita, pagamento)
- `POST /farmacias` (adicionar manual) · `PATCH /farmacias/:id`
  (eh_cliente, status_visita, perfil_pagamento, perfil_compra)
- `GET /farmacias/:id/relatorios` · `POST /farmacias/:id/relatorios`
- `GET /pedidos` · `POST /pedidos` · `PATCH /pedidos/:id` (status)
- `GET /stats?periodo=7|30|90` → agregados do Painel
- `GET /usuarios` → equipe (para Conta)

## 7. Mapa

- **MapLibre** (`@maplibre/maplibre-react-native`) + tiles OpenStreetMap,
  sem Google e sem chave de API. `react-native-maps` descartado (usa Google
  Maps SDK como base no Android).
- Marcadores custom: cliente = bolinha verde preenchida com "+"; não-cliente
  = bolinha branca com borda. Marcador selecionado aumenta de escala.
- Geolocalização: `expo-location` ("minha localização").
- "Rota": deep link externo para Google Maps / Waze (fora do app).
- Seed inicial: script Overpass importa farmácias de Maceió com lat/lng.

## 8. App nativo / build

- **Expo** (React Native) — telas recriadas em componentes nativos.
- Navegação: React Navigation (`native-stack` + `bottom-tabs`).
- Sessão: token JWT em `@react-native-async-storage/async-storage`.
- Bottom sheets: `@gorhom/bottom-sheet` + `react-native-gesture-handler`.
- Fontes: `expo-font` (IBM Plex Mono do design).
- Tema: cor principal `#7a2833` (vinho) no splash, ícone e `theme/`.
- Build `.apk` via **EAS Build** (nuvem) — requer conta Expo gratuita
  (`eas login`). Config em `eas.json` + `app.json`.

## 9. Fora de escopo (v1)

- Recuperação de senha / auto-cadastro (usuários criados manualmente/seed).
- Cálculo automático de `perfil_pagamento` a partir dos pedidos (fase 2).
- Navegação/roteamento dentro do próprio app (usa Maps/Waze externo).
- Notificações push reais (os toggles em Conta são preferências locais v1).
- Papéis/permissões diferenciadas entre usuários.

## 10. Evoluções futuras (fase 2+)

- Perfil de pagamento sugerido automaticamente pelo histórico de pedidos.
- Notificações push (alertas de visita/cobrança, resumo diário).
- Exportação de relatórios.
