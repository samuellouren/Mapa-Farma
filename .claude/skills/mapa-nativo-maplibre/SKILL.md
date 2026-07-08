---
name: mapa-nativo-maplibre
description: Use esta skill sempre que for mexer no mapa do Mapa Farma — adicionar/editar marcadores de farmácia, filtros do mapa, cores de status, ficha ao tocar num marcador, ou carga inicial de farmácias via Overpass API. Este projeto usa MapLibre (nativo, React Native), NÃO Leaflet e NÃO react-native-maps. Nunca usar Google Maps SDK nem exigir chave de API.
---

# Mapa de farmácias (MapLibre — React Native)

## Stack fixa deste projeto
- Biblioteca de mapa: **MapLibre** (`@maplibre/maplibre-react-native`) —
  motor de mapa nativo, independente do Google, feito pra tiles OSM.
- **NUNCA usar `react-native-maps`** neste projeto: no Android ele usa o
  Google Maps SDK como base mesmo sobrepondo tiles OSM, o que exige chave
  de API do Google — contraria a decisão travada de "sem Google, sem
  chave".
- **NUNCA usar Leaflet.js** — Leaflet é biblioteca web (DOM/HTML), não
  funciona em React Native. Essa era a stack da versão PWA, que foi
  descontinuada.
- Tiles: **OpenStreetMap**, gratuitos, sem chave de API.
- Fonte da lista de farmácias: **duas bases públicas complementares**,
  consultadas apenas em carga inicial (`server/src/seed/`) — o app NUNCA
  consulta essas APIs em runtime, só reaproveita o que está salvo no banco:
  1. **Overpass API** (OpenStreetMap) — `seed/overpass.js`. Precisa de
     `User-Agent` identificável (sem ele o Overpass devolve 406).
  2. **CNES / DataSUS** (API de Dados Abertos DEMAS) — `seed/cnes.js`.
     Endpoint `apidadosabertos.saude.gov.br/cnes/estabelecimentos`
     (`codigo_municipio=270430` = Maceió, `codigo_tipo_unidade=43` =
     farmácia), gratuito, sem chave/cartão, pagina de 20 em 20 via `offset`.
     Traz coordenada/bairro/endereço mais completos que o Overpass, então
     complementa e enriquece a base.

### Deduplicação ao rodar os seeds (importante para re-execuções)
O `seed/cnes.js` cruza cada farmácia do CNES com o que já existe no banco
por **nome normalizado + proximidade de coordenadas (Haversine ≤ 150 m)**:
- casou com uma existente → **enriquece** campos vazios (bairro/endereço),
  não duplica;
- não casou → **insere** como nova.
Filiais diferentes da mesma rede (ex.: Drogasil) em endereços distintos são
lojas diferentes e entram como registros separados — isso é esperado, não é
duplicata. Flags: `seed/cnes.js --dry` simula sem gravar; `seed/overpass.js
--reset` limpa antes de reimportar e `--force` reimporta sem limpar.

Observação: o tipo 43 do CNES inclui algumas farmácias públicas/
institucionais (CEAF, farmácia de acolhimento) que não são drogarias
comerciais — decisão de filtrar ou não fica com o usuário; hoje entram todas
e a equipe marca `eh_cliente` manualmente.

## Regra de cor dos marcadores (não mudar sem confirmar com o usuário)
- Farmácia **não-cliente** (padrão inicial de todas): marcador branco com
  borda.
- Farmácia marcada como **cliente**: marcador verde preenchido com "+",
  visualmente diferente à distância, sem precisar abrir a ficha.
- A cor é derivada do campo `eh_cliente` (boolean) da farmácia no banco —
  nunca hardcodar lista de farmácias-cliente no componente.
- Marcador selecionado aumenta de escala (conforme o design original).

## Comportamento ao tocar num marcador
- Abre um bottom sheet (não popup pequeno) com: nome, endereço, chips de
  relação/status de visita/perfil de pagamento, botões "Rota" (abre
  navegação externa — Google Maps/Waze via link/deep link, não navegação
  dentro do app) e "Abrir ficha" (leva pra tela Ficha completa).

## Geolocalização
- `expo-location` para pedir permissão e centralizar o mapa na posição do
  usuário ("minha localização").

## Filtros do mapa
Filtros existentes: relação (todas/clientes/não-clientes), status de
visita, perfil de pagamento; contador tipo "Ver N farmácias". Filtros são
aplicados no array de farmácias já carregado da API (client-side), não
geram nova query ao Overpass nem ao backend a cada mudança de filtro.

## Ao adicionar uma nova farmácia manualmente
Farmácias vêm por padrão do Overpass, mas se o usuário quiser adicionar
uma que não apareceu automaticamente, o formulário deve pedir: nome,
endereço, latitude, longitude — os mesmos campos que vêm do Overpass, pra
manter a tabela consistente.
