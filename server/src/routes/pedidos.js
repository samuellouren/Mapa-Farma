import { Router } from 'express';
import { db } from '../db.js';
import { autenticar } from '../middleware/auth.js';
import { ah } from '../lib/asyncHandler.js';
import { STATUS_PAGAMENTO } from '../lib/enums.js';

export const pedidosRouter = Router();
pedidosRouter.use(autenticar);

// GET /pedidos  (lista com nome/bairro da farmácia)
pedidosRouter.get('/', ah(async (req, res) => {
  const r = await db.execute(
    `SELECT p.*, f.nome AS farmacia_nome, f.bairro AS farmacia_bairro
     FROM pedidos p JOIN farmacias f ON f.id = p.farmacia_id
     ORDER BY p.data_pedido DESC, p.id DESC`
  );
  res.json(r.rows);
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

// PATCH /pedidos/:id  { status_pagamento }
pedidosRouter.patch('/:id', ah(async (req, res) => {
  const { status_pagamento } = req.body || {};
  if (!STATUS_PAGAMENTO.includes(status_pagamento)) return res.status(400).json({ erro: 'status_pagamento inválido' });
  await db.execute({ sql: 'UPDATE pedidos SET status_pagamento = ? WHERE id = ?', args: [status_pagamento, req.params.id] });
  const r = await db.execute({ sql: 'SELECT * FROM pedidos WHERE id = ?', args: [req.params.id] });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado' });
  res.json(r.rows[0]);
}));
