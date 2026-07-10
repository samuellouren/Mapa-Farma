---
name: schema-turso
description: Use esta skill sempre que for criar/alterar tabelas, escrever migrations, seeds, ou qualquer código de backend/frontend que leia ou grave no banco do Mapa Farma, ou que precise traduzir entre os valores curtos do design e os valores do banco. Fonte de verdade do schema — versão aprovada em docs/superpowers/specs.
---

# Schema do banco (Turso / libSQL) — v1 aprovada

## Regra geral
Banco único, compartilhado por todos os usuários (3 a 5). Nenhuma tabela é
isolada por usuário — farmácias, relatórios e pedidos são visíveis para
toda a equipe. O campo `usuario_id` serve só para saber QUEM registrou
algo, nunca para restringir visibilidade. Não existe coluna de papel/role
— todos os usuários têm o mesmo nível de acesso (decisão travada com o
cliente, não reabrir sem confirmar).

## Tabela: farmacias
| campo | tipo | observação |
|---|---|---|
| id | integer PK | |
| nome | text | |
| endereco | text | |
| bairro | text | |
| latitude | real | vem do Overpass ou cadastro manual — nunca fake |
| longitude | real | |
| eh_cliente | boolean | default false — controla a cor do marcador no mapa (verde = cliente, branco = não-cliente) |
| status_visita | text | `nao_visitada` \| `a_visitar` \| `visitada` |
| perfil_pagamento | text \| null | `paga_em_dia` \| `atrasa` \| `nao_paga` — MANUAL, o vendedor marca; não é calculado a partir dos pedidos (ver seção Fase 2) |
| perfil_compra | text \| null | `compra_bem` \| `compra_pouco` \| `nao_compra` — manual |
| origem | text | `overpass` \| `cnes` \| `manual` \| `seed` — quem inseriu a farmácia. Só `manual` (cadastro pela equipe) pode ser editada/excluída. Seeds gravam `seed`; registros pré-migration `002` viraram `seed` no backfill. `overpass`/`cnes` reservados p/ re-derivação futura |
| criado_em | datetime | |

## Tabela: relatorios_visita
| campo | tipo | observação |
|---|---|---|
| id | integer PK | |
| farmacia_id | integer FK → farmacias.id | |
| usuario_id | integer FK → usuarios.id | quem registrou a visita |
| data_visita | date | sempre a data real do sistema no momento do registro — nunca fixa/editável pelo usuário |
| horario_chegada | text | formato HH:MM |
| duracao_minutos | integer | opções do design: 10/20/30/45 |
| observacao | text | |
| criado_em | datetime | |

Salvar um relatório também atualiza `farmacias.status_visita` para `visitada`.

## Tabela: usuarios
| campo | tipo | observação |
|---|---|---|
| id | integer PK | |
| nome | text | |
| email | text unique | usado no login |
| senha_hash | text | bcrypt |
| criado_em | datetime | |

Login é email + senha, sem fluxo de recuperação de senha (fora de escopo
v1 — usuários são criados manualmente/seed). Autenticação via JWT.

## Tabela: pedidos
| campo | tipo | observação |
|---|---|---|
| id | integer PK | |
| farmacia_id | integer FK → farmacias.id | |
| usuario_id | integer FK → usuarios.id | quem registrou o pedido |
| valor_centavos | integer | dinheiro sempre em centavos — nunca usar float/real pra valor monetário |
| status_pagamento | text | `pago` \| `atrasado` \| `nao_pago` — fato concreto deste pedido |
| data_pedido | date | |
| criado_em | datetime | |

**Importante:** `status_pagamento` (do pedido) e `perfil_pagamento` (da
farmácia) são conceitos DIFERENTES e independentes nesta v1:
- `perfil_pagamento` = avaliação/reputação manual do vendedor sobre o
  cliente em geral ("costuma pagar em dia").
- `status_pagamento` = fato concreto de UM pedido específico.

Calcular `perfil_pagamento` automaticamente a partir do histórico de
`status_pagamento` dos pedidos é evolução de **fase 2** — não implementar
isso na v1 sem confirmar com o usuário antes.

## Mapeamento de enums: design → banco
O HTML do design (`Mapa_Farma.html`) usa chaves curtas nos data-bindings;
o banco usa valores verbosos. Essa tradução acontece no frontend (camada
`api/` ou `lib/`), nunca mudar o valor do banco para "economizar"
tradução:

| conceito | valor no design | valor no banco |
|---|---|---|
| status de visita | `visitada` | `visitada` |
| status de visita | `avisitar` | `a_visitar` |
| status de visita | `nao` | `nao_visitada` |
| perfil pagamento | `emdia` | `paga_em_dia` |
| perfil pagamento | `atrasa` | `atrasa` |
| perfil pagamento | `naopaga` | `nao_paga` |
| perfil compra | `bem` | `compra_bem` |
| perfil compra | `pouco` | `compra_pouco` |
| perfil compra | `nao` | `nao_compra` |
| status pedido | `pago` | `pago` |
| status pedido | `atrasado` | `atrasado` |
| status pedido | `naopago` | `nao_pago` |

## Convenções
- Nomes de tabela e campo em português, snake_case.
- Toda alteração de schema é migration versionada em `server/src/migrations/`
  (ex: `001_init.sql`), nunca ALTER TABLE direto sem registro.
- Estatísticas do Painel e totais de Pedidos (vendido/recebido/a receber)
  são sempre calculados via query nas tabelas acima — não criar tabela
  separada de "estatísticas" pré-agregada.
- Farmácias entram no banco via seed inicial do Overpass API
  (`server/src/seed/`) + podem ser adicionadas/corrigidas manualmente pela
  equipe depois — sempre com latitude/longitude reais, nunca coordenadas
  fake.
