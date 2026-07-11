import { Router } from 'express';
import { db } from '../db.js';
import { autenticar } from '../middleware/auth.js';
import { ah } from '../lib/asyncHandler.js';
import { STATUS_PAGAMENTO } from '../lib/enums.js';

export const pedidosRouter = Router();
pedidosRouter.use(autenticar);

// GET /pedidos  →  { pedidos: [...], totais: { vendido, recebido, a_receber } }
// Os totais são somados NO BANCO (SUM), não no cliente — assim ficam corretos
// sobre TODOS os pedidos mesmo quando a lista for paginada no futuro, e o app
// não precisa baixar tudo só pra somar. Mesmo padrão de agregação do /stats.
pedidosRouter.get('/', ah(async (req, res) => {
  const lista = await db.execute(
    `SELECT p.*, f.nome AS farmacia_nome, f.bairro AS farmacia_bairro
     FROM pedidos p JOIN farmacias f ON f.id = p.farmacia_id
     ORDER BY p.data_pedido DESC, p.id DESC`
  );
  const t = await db.execute(
    `SELECT
       COALESCE(SUM(valor_centavos), 0) AS vendido,
       COALESCE(SUM(CASE WHEN status_pagamento =  'pago' THEN valor_centavos ELSE 0 END), 0) AS recebido,
       COALESCE(SUM(CASE WHEN status_pagamento <> 'pago' THEN valor_centavos ELSE 0 END), 0) AS a_receber
     FROM pedidos`
  );
  const { vendido, recebido, a_receber } = t.rows[0];
  res.json({ pedidos: lista.rows, totais: { vendido, recebido, a_receber } });
}));

// POST /pedidos  { farmacia_id, valor_centavos, status_pagamento?, data_pedido? }
pedidosRouter.post('/', ah(async (req, res) => {
  const { farmacia_id, valor_centavos, status_pagamento, data_pedido } = req.body || {};
  if (!farmacia_id || !Number.isInteger(valor_centavos)) {
    return res.status(400).json({ erro: 'farmacia_id e valor_centavos (inteiro em centavos) são obrigatórios' });
  }
  const status = status_pagamento ?? 'pago';
  if (!STATUS_PAGAMENTO.includes(status)) return res.status(400).json({ erro: 'status_pagamento inválido' });
  const data = data_pedido || new Date().toISOString().slice(0, 10);

  const far = await db.execute({ sql: 'SELECT id FROM farmacias WHERE id = ?', args: [farmacia_id] });
  if (!far.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });

  const ins = await db.execute({
    sql: `INSERT INTO pedidos (farmacia_id, usuario_id, valor_centavos, status_pagamento, data_pedido)
          VALUES (?,?,?,?,?)`,
    args: [farmacia_id, req.usuario.id, valor_centavos, status, data],
  });
  const r = await db.execute({
    sql: `SELECT p.*, f.nome AS farmacia_nome, f.bairro AS farmacia_bairro
          FROM pedidos p JOIN farmacias f ON f.id = p.farmacia_id WHERE p.id = ?`,
    args: [ins.lastInsertRowid],
  });
  res.status(201).json(r.rows[0]);
}));

// PATCH /pedidos/:id  { status_pagamento?, valor_centavos?, farmacia_id? }
// Aplica só os campos presentes. data_pedido é imutável (não aceito).
pedidosRouter.patch('/:id', ah(async (req, res) => {
  const b = req.body || {};
  const { status_pagamento, valor_centavos, farmacia_id } = b;
  const campos = [];
  const args = [];

  if (status_pagamento !== undefined) {
    if (!STATUS_PAGAMENTO.includes(status_pagamento)) return res.status(400).json({ erro: 'status_pagamento inválido' });
    campos.push('status_pagamento = ?'); args.push(status_pagamento);
  }
  if (valor_centavos !== undefined) {
    if (!Number.isInteger(valor_centavos) || valor_centavos <= 0) {
      return res.status(400).json({ erro: 'valor_centavos deve ser inteiro em centavos maior que zero' });
    }
    campos.push('valor_centavos = ?'); args.push(valor_centavos);
  }
  if (farmacia_id !== undefined) {
    const far = await db.execute({ sql: 'SELECT id FROM farmacias WHERE id = ?', args: [farmacia_id] });
    if (!far.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
    campos.push('farmacia_id = ?'); args.push(farmacia_id);
  }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' });

  args.push(req.params.id);
  await db.execute({ sql: `UPDATE pedidos SET ${campos.join(', ')} WHERE id = ?`, args });
  const r = await db.execute({
    sql: `SELECT p.*, f.nome AS farmacia_nome, f.bairro AS farmacia_bairro
          FROM pedidos p JOIN farmacias f ON f.id = p.farmacia_id WHERE p.id = ?`,
    args: [req.params.id],
  });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado' });
  res.json(r.rows[0]);
}));

// DELETE /pedidos/:id  — pedido é registro-folha, sem cascade
pedidosRouter.delete('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.execute({ sql: 'SELECT id FROM pedidos WHERE id = ?', args: [req.params.id] });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado' });
  await db.execute({ sql: 'DELETE FROM pedidos WHERE id = ?', args: [req.params.id] });
  res.json({ ok: true });
}));
