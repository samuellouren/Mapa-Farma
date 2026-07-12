-- 003_notificacoes.sql — vencimento de pedido + push token e preferências de
-- notificação por usuário. Colunas de usuarios ficam sem uso até a Fase 3.
ALTER TABLE pedidos  ADD COLUMN data_vencimento date;               -- null nos pedidos antigos
ALTER TABLE usuarios ADD COLUMN expo_push_token  text;              -- null até o device registrar
ALTER TABLE usuarios ADD COLUMN notif_alertas    integer DEFAULT 1; -- recebe o digest das 8h
ALTER TABLE usuarios ADD COLUMN notif_resumo     integer DEFAULT 1; -- recebe o resumo das 22h30
