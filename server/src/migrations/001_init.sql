-- 001_init.sql — schema inicial do Mapa Farma (Turso / libSQL / SQLite)
-- Fonte de verdade: .claude/skills/schema-turso/SKILL.md
-- Banco único compartilhado por toda a equipe (3 a 5 usuários).
-- Nenhuma tabela é isolada por usuário; usuario_id indica apenas QUEM
-- registrou algo, nunca restringe visibilidade.
--
-- Observação: chaves estrangeiras exigem `PRAGMA foreign_keys = ON;` por
-- conexão (feito em db.js). CHECKs abaixo travam exatamente os valores de
-- enum documentados na skill.

-- ---------------------------------------------------------------------------
-- usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT     NOT NULL,
  email       TEXT     NOT NULL UNIQUE,
  senha_hash  TEXT     NOT NULL,
  criado_em   DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- farmacias
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farmacias (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nome              TEXT    NOT NULL,
  endereco          TEXT,
  bairro            TEXT,
  latitude          REAL,
  longitude         REAL,
  eh_cliente        BOOLEAN NOT NULL DEFAULT 0,
  status_visita     TEXT    NOT NULL DEFAULT 'nao_visitada'
                      CHECK (status_visita IN ('nao_visitada', 'a_visitar', 'visitada')),
  perfil_pagamento  TEXT
                      CHECK (perfil_pagamento IN ('paga_em_dia', 'atrasa', 'nao_paga')),
  perfil_compra     TEXT
                      CHECK (perfil_compra IN ('compra_bem', 'compra_pouco', 'nao_compra')),
  criado_em         DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- relatorios_visita
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relatorios_visita (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  farmacia_id      INTEGER NOT NULL REFERENCES farmacias(id) ON DELETE CASCADE,
  usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
  data_visita      DATE    NOT NULL,
  horario_chegada  TEXT,
  duracao_minutos  INTEGER,
  observacao       TEXT,
  criado_em        DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- pedidos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  farmacia_id       INTEGER NOT NULL REFERENCES farmacias(id) ON DELETE CASCADE,
  usuario_id        INTEGER NOT NULL REFERENCES usuarios(id),
  valor_centavos    INTEGER NOT NULL,
  status_pagamento  TEXT    NOT NULL DEFAULT 'pago'
                      CHECK (status_pagamento IN ('pago', 'atrasado', 'nao_pago')),
  data_pedido       DATE    NOT NULL,
  criado_em         DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- índices de apoio (consultas mais frequentes)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_relatorios_farmacia ON relatorios_visita(farmacia_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_farmacia    ON pedidos(farmacia_id);
CREATE INDEX IF NOT EXISTS idx_farmacias_cliente   ON farmacias(eh_cliente);
