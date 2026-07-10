# Editar e excluir farmácias manuais — design

**Data:** 2026-07-10
**Status:** aprovado para planejamento

## Objetivo

Permitir **editar** e **excluir** farmácias na Ficha, mas **somente** as que
foram adicionadas manualmente pela equipe (via o fluxo do FAB "+" / long press
→ `NovaFarmaciaSheet`). Farmácias que vieram dos seeds automáticos (Overpass /
CNES) não podem ser editadas nem excluídas — os botões nem aparecem.

Motivação: dado de seed é reimportável e compartilhado; editar/excluir esse dado
causaria inconsistência silenciosa. Dado manual é responsabilidade da equipe e
faz sentido poder corrigir/remover.

## Decisões travadas (com o cliente)

1. **Exclusão com histórico vinculado → escalonado por tipo de vínculo.**
2. **Backfill de `origem` dos registros existentes → valor genérico `'seed'`.**
   Não há como separar overpass de cnes retroativamente sem re-consultar rede;
   rotular tudo como `'overpass'` seria dado errado por conveniência. Um valor
   `'seed'` genérico é honesto: "veio de algum seed automático, não-editável".

## 1. Schema

Nova coluna `origem` em `farmacias`, valores `'overpass' | 'cnes' | 'manual' | 'seed'`.
Apenas `'manual'` habilita editar/excluir; os demais são não-editáveis.
`'overpass'`/`'cnes'` ficam **reservados** no enum (uma eventual re-derivação
precisa poderia usá-los no futuro), mas nenhum writer os grava por ora — os
seeds gravam `'seed'` (ver abaixo). Fonte de verdade do schema:
`.claude/skills/schema-turso`. Migration versionada em
`server/src/migrations/002_origem.sql` (o runner `migrate.js` aplica em ordem e
registra em `_migrations`).

```sql
-- 002_origem.sql
ALTER TABLE farmacias ADD COLUMN origem TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem IN ('overpass', 'cnes', 'manual', 'seed'));

-- Backfill: todo registro pré-existente veio de algum seed automático
-- (Overpass/CNES) e é não-editável. Não há sinal no banco para separar overpass
-- de cnes retroativamente (os seeds inseriam colunas idênticas), e rotular tudo
-- como 'overpass' seria dado errado por conveniência. Usamos o valor genérico
-- 'seed' = "origem de seed automático, não-editável". Só 'manual' habilita
-- editar/excluir.
UPDATE farmacias SET origem = 'seed';
```

Notas:
- `ADD COLUMN` com `NOT NULL DEFAULT 'manual'` preenche as linhas existentes com
  `'manual'`; o `UPDATE` seguinte as corrige para `'seed'`. Ordem importa (sem o
  UPDATE, os registros de seed ficariam editáveis).
- Após a migration, um `INSERT` que **omita** `origem` (ex.: um POST manual)
  recebe o default `'manual'` — o comportamento desejado.
- O CHECK trava os quatro valores, como os demais enums do schema.

### Seeds passam a gravar `origem = 'seed'`

Ambos os seeds gravam `'seed'` nas linhas que **inserem** — não `'overpass'`/
`'cnes'`. Racional (decisão do cliente): a mesma imprecisão de atribuição se
repetiria a cada re-seed, e o único valor com efeito de comportamento é
`'manual'`; então tudo que vem de seed automático é `'seed'`.
- `seed/overpass.js`: `INSERT ... (..., origem) VALUES (..., 'seed')`.
- `seed/cnes.js`: linhas **novas** → `origem = 'seed'`. Os `UPDATE` de
  enriquecimento **não** mexem em `origem` (a linha continua sendo de seed).

## 2. Backend (`server/src/routes/farmacias.js`)

### POST /farmacias (cadastro manual)
Grava `origem = 'manual'` explicitamente (não depende só do default):
`INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude, origem) VALUES (?,?,?,?,?, 'manual')`.

### GET /farmacias/:id (ficha) — passa a devolver contagem de vínculos
Para o cliente montar o alerta de exclusão certo sem round-trip extra:
```sql
SELECT f.*,
  (SELECT COUNT(*) FROM relatorios_visita WHERE farmacia_id = f.id) AS relatorios_count,
  (SELECT COUNT(*) FROM pedidos          WHERE farmacia_id = f.id) AS pedidos_count
FROM farmacias f WHERE f.id = ?
```

### PATCH /farmacias/:id — guarda de identidade (ponto 5, com escopo)
**Importante:** o PATCH atual edita campos de negócio (`eh_cliente`,
`status_visita`, `perfil_pagamento`, `perfil_compra`) de **qualquer** farmácia —
é o núcleo do app (marcar cliente/visitada numa farmácia de seed). Isso
**continua livre para todas**.

A guarda `origem === 'manual'` vale **apenas para os campos de identidade**
(`nome`, `endereco`, `bairro`, `latitude`, `longitude`):
- Se o corpo trouxer qualquer campo de identidade, carregar a farmácia; se
  `origem !== 'manual'` → `403 { erro: 'Só farmácias adicionadas manualmente podem ser editadas.' }`.
- Se `latitude`/`longitude` vierem, validar `dentroDeMaceio(lng, lat)` (mesma
  regra do POST) → `400` se fora.
- Campos de negócio seguem sem restrição.

### DELETE /farmacias/:id — novo, com política escalonada (ponto 4)
Ordem de verificação (tudo no servidor, não confiar na UI):
1. Carregar farmácia + `relatorios_count` + `pedidos_count`. Ausente → `404`.
2. `origem !== 'manual'` → `403 { erro: 'Só farmácias adicionadas manualmente podem ser excluídas.' }`.
3. `pedidos_count > 0` → `409 { erro, pedidos_count }` — **bloqueia**. Pedidos
   alimentam o financeiro do Painel/Pedidos; apagá-los mudaria totais de venda
   retroativamente. Mensagem sugere editar em vez de excluir.
4. Caso contrário → `DELETE FROM farmacias WHERE id = ?`. O `ON DELETE CASCADE`
   remove os `relatorios_visita` junto (visitas são operacionais, não
   financeiras; a perda é consentida no alerta do cliente). Responde `200 { ok: true }`.

### Lib testável: `server/src/lib/exclusao.js`
A decisão da política vira função pura, testável e reusada pela rota:
```js
// avaliarExclusao({ origem, pedidos_count, relatorios_count })
//   → { permitido: boolean, motivo?: 'nao_manual' | 'tem_pedidos', apagaVisitas: number }
```
- `origem !== 'manual'` → `{ permitido:false, motivo:'nao_manual' }`
- `pedidos_count > 0` → `{ permitido:false, motivo:'tem_pedidos' }`
- senão → `{ permitido:true, apagaVisitas: relatorios_count }`

## 3. Cliente — API (`client/src/api/client.js`)
- `excluirFarmacia: (id) => request('/farmacias/' + id, { method: 'DELETE' })`
- `atualizarFarmacia(id, patch)` **já existe** (PATCH) — reusado para a edição de
  identidade (envia `{ nome, endereco, bairro, latitude, longitude }`).

## 4. Cliente — UI da Ficha (`client/src/screens/FichaScreen.js`)

### Botões editar/excluir (ponto 2)
- Renderizados **somente** quando `farmacia.origem === 'manual'`. Para seed:
  ausentes de vez (não desabilitados).
- Local discreto: uma linha no **rodapé** da Ficha (abaixo do card de
  histórico), com dois links de baixo destaque — **Editar dados** (secundário) e
  **Excluir** (texto vermelho/`cores.vermelho`). Fora do caminho das ações
  principais (Registrar visita, Traçar rota), seguindo o padrão de links de
  texto já usado ("Ver tudo", "Ajustar").

### Fluxo de edição (ponto 3) — reusa `NovaFarmaciaSheet`
A Ficha passa a orquestrar `NovaFarmaciaSheet` + `SeletorLocalizacao`, espelhando
a máquina de estado que o `MapaScreen` já usa (`seletor` / `novaFarmacia`):
- Estados na Ficha: `editando` (sheet aberto) e `seletor` (mapa de ajuste).
- "Editar dados" → abre `NovaFarmaciaSheet` em `modo='editar'`, pré-preenchido
  com `nome/endereco/bairro` atuais e `coordenada` atual.
- "Ajustar" dentro do sheet → abre `SeletorLocalizacao` guardando o rascunho;
  ao confirmar, volta ao sheet com a nova coordenada + endereço/bairro do
  geocode reverso (idêntico ao fluxo de criação).
- Salvar → `api.atualizarFarmacia(id, dados)`; fecha o sheet; atualiza o estado
  local com merge (`setFarmacia(prev => ({ ...prev, ...f }))`) para preservar os
  contadores, que o PATCH de identidade não retorna.

### `NovaFarmaciaSheet` parametrizado
Novas props (mantendo compatibilidade com o uso atual no MapaScreen):
- `modo = 'criar' | 'editar'` (default `'criar'`).
- `idAlvo` (id da farmácia em edição; `null` na criação).
- `onSalvo(farmacia)` — callback unificado (substitui/generaliza `onCriada`).
- Internamente: título e texto do botão variam por `modo`; ao salvar, chama
  `api.atualizarFarmacia(idAlvo, dados)` (editar) ou `api.criarFarmacia(dados)`
  (criar). Os campos e a validação de bbox são os mesmos.

### Fluxo de exclusão (ponto 4) — confirmação via `Alert`
Usa os contadores já carregados na Ficha (`relatorios_count`, `pedidos_count`):
- `pedidos_count > 0` → `Alert` informativo (só **OK**): "Não é possível excluir:
  esta farmácia tem N pedido(s) registrado(s). Edite os dados se precisar
  corrigir." Não chama o DELETE (o servidor também bloqueia).
- senão, `relatorios_count > 0` → `Alert` **destrutivo** [Cancelar / Excluir]:
  "Tem certeza? Isso também apagará N visita(s) registrada(s). Não pode ser
  desfeito."
- senão (sem vínculo) → `Alert` [Cancelar / Excluir]: "Tem certeza? Isso não
  pode ser desfeito."
- Ao confirmar → `api.excluirFarmacia(id)` → sucesso: `navigation.goBack()`. O
  `MapaScreen` recarrega a lista no `useFocusEffect`, então o mapa reflete a
  remoção sem passo extra. Erro `409` (corrida: pedido criado nesse meio-tempo)
  → mostra a mensagem de bloqueio.

## Arquivos afetados

**Servidor:**
- `src/migrations/002_origem.sql` (novo)
- `src/seed/overpass.js` (INSERT grava `origem='seed'`)
- `src/seed/cnes.js` (INSERT de novas grava `origem='seed'`)
- `src/routes/farmacias.js` (POST explícito; GET detalhe com contadores; PATCH
  com guarda de identidade; DELETE novo)
- `src/lib/exclusao.js` (novo, função pura da política)
- `.claude/skills/schema-turso/SKILL.md` (fonte de verdade do schema: adicionar a
  linha `origem` na tabela `farmacias` + os valores do enum)

**Cliente:**
- `src/api/client.js` (`excluirFarmacia`)
- `src/components/NovaFarmaciaSheet.js` (modo criar/editar; `onCriada` → `onSalvo`)
- `src/screens/MapaScreen.js` (atualizar o call site do sheet: prop `onCriada` →
  `onSalvo`, passar `modo='criar'` — mantém o cadastro atual funcionando)
- `src/screens/FichaScreen.js` (rodapé editar/excluir; orquestração sheet+seletor;
  confirmação de exclusão)

## Testes
- `server/test/exclusao.test.js` (novo): cobre `avaliarExclusao` nos casos
  não-manual, com pedidos, só com visitas, e sem vínculo.
- Verificação manual no aparelho (o que só o device confirma): visibilidade dos
  botões por `origem`, fluxo de edição com ajuste de local, e os três caminhos
  de exclusão.
- Bundle Android (`expo export`) e testes do servidor (`node --test`) devem
  passar limpos antes de considerar concluído.
- A migration `002_origem.sql` é validada rodando `npm run migrate` contra um
  banco de rascunho (`file:` local) — confirma que `ADD COLUMN` com `CHECK` +
  `UPDATE` de backfill aplica sem erro no libSQL antes de tocar produção.

## Fora de escopo (YAGNI)
- Soft-delete / arquivamento (descartado na decisão do ponto 4).
- Re-derivação de `origem` por re-consulta a Overpass/CNES (descartado no
  backfill pragmático).
- Cálculo automático de perfis a partir de pedidos (já é fase 2 no schema).
- Edição dos campos de negócio via este fluxo (já existe na Ficha, sem mudança).
```
