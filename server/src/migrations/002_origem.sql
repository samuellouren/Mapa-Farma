-- 002_origem.sql — origem da farmácia (seed automático vs cadastro manual).
-- Só 'manual' pode ser editada/excluída pela equipe. 'overpass'/'cnes' ficam
-- reservados no enum para uma eventual re-derivação precisa futura; por ora os
-- seeds gravam 'seed' e o POST manual grava 'manual'.
ALTER TABLE farmacias ADD COLUMN origem TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem IN ('overpass', 'cnes', 'manual', 'seed'));

-- Backfill: todo registro pré-existente veio de seed automático e é
-- não-editável. Não há sinal no banco para separar overpass de cnes
-- retroativamente; usa-se o valor genérico 'seed' (honesto). O UPDATE é
-- obrigatório: sem ele, as linhas ficariam com o default 'manual' e viriam
-- editáveis por engano.
UPDATE farmacias SET origem = 'seed';
