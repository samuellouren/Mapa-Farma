import { Router } from 'express';
import { db } from '../db.js';
import { autenticar } from '../middleware/auth.js';
import { ah } from '../lib/asyncHandler.js';
import { STATUS_VISITA, PERFIL_PAGAMENTO, PERFIL_COMPRA } from '../lib/enums.js';
import { dentroDeMaceio } from '../lib/limite-maceio.js';

export const farmaciasRouter = Router();
farmaciasRouter.use(autenticar);

// GET /farmacias?busca=&relacao=cliente|nao&status_visita=&perfil_pagamento=
farmaciasRouter.get('/', ah(async (req, res) => {
  const { busca, relacao, status_visita, perfil_pagamento } = req.query;
  const where = [];
  const args = [];

  if (busca) {
    where.push('(LOWER(nome) LIKE ? OR LOWER(bairro) LIKE ?)');
    const q = '%' + String(busca).toLowerCase() + '%';
    args.push(q, q);
  }
  if (relacao === 'cliente') where.push('eh_cliente = 1');
  else if (relacao === 'nao') where.push('eh_cliente = 0');

  if (status_visita) { where.push('status_visita = ?'); args.push(status_visita); }
  if (perfil_pagamento) { where.push('perfil_pagamento = ?'); args.push(perfil_pagamento); }

  const sql =
    'SELECT * FROM farmacias' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY nome';
  const r = await db.execute({ sql, args });
  res.json(r.rows);
}));

// GET /farmacias/:id  (ficha)
farmaciasRouter.get('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.execute({ sql: 'SELECT * FROM farmacias WHERE id = ?', args: [req.params.id] });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
  res.json(r.rows[0]);
}));

// POST /farmacias  (cadastro manual — mesmos campos que vêm do Overpass)
farmaciasRouter.post('/', ah(async (req, res) => {
  const { nome, endereco, bairro, latitude, longitude } = req.body || {};
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ erro: 'nome é obrigatório' });
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ erro: 'latitude e longitude são obrigatórias e numéricas' });
  }
  if (!dentroDeMaceio(lng, lat)) {
    return res.status(400).json({ erro: 'Coordenada fora dos limites de Maceió' });
  }
  const ins = await db.execute({
    sql: 'INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude) VALUES (?,?,?,?,?)',
    args: [String(nome).trim(), endereco ?? null, bairro ?? null, lat, lng],
  });
  const r = await db.execute({ sql: 'SELECT * FROM farmacias WHERE id = ?', args: [ins.lastInsertRowid] });
  res.status(201).json(r.rows[0]);
}));

// PATCH /farmacias/:id  (campos de negócio: relação, visita, perfis)
farmaciasRouter.patch('/:id', ah(async (req, res) => {
  const { eh_cliente, status_visita, perfil_pagamento, perfil_compra } = req.body || {};
  const campos = [];
  const args = [];

  if (eh_cliente !== undefined) { campos.push('eh_cliente = ?'); args.push(eh_cliente ? 1 : 0); }
  if (status_visita !== undefined) {
    if (!STATUS_VISITA.includes(status_visita)) return res.status(400).json({ erro: 'status_visita inválido' });
    campos.push('status_visita = ?'); args.push(status_visita);
  }
  if (perfil_pagamento !== undefined) {
    if (perfil_pagamento !== null && !PERFIL_PAGAMENTO.includes(perfil_pagamento))
      return res.status(400).json({ erro: 'perfil_pagamento inválido' });
    campos.push('perfil_pagamento = ?'); args.push(perfil_pagamento);
  }
  if (perfil_compra !== undefined) {
    if (perfil_compra !== null && !PERFIL_COMPRA.includes(perfil_compra))
      return res.status(400).json({ erro: 'perfil_compra inválido' });
    campos.push('perfil_compra = ?'); args.push(perfil_compra);
  }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' });

  args.push(req.params.id);
  await db.execute({ sql: `UPDATE farmacias SET ${campos.join(', ')} WHERE id = ?`, args });
  const r = await db.execute({ sql: 'SELECT * FROM farmacias WHERE id = ?', args: [req.params.id] });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
  res.json(r.rows[0]);
}));

// GET /farmacias/:id/relatorios  (timeline / histórico)
farmaciasRouter.get('/:id/relatorios', ah(async (req, res) => {
  const r = await db.execute({
    sql: `SELECT rv.*, u.nome AS usuario_nome
          FROM relatorios_visita rv
          JOIN usuarios u ON u.id = rv.usuario_id
          WHERE rv.farmacia_id = ?
          ORDER BY rv.data_visita DESC, rv.id DESC`,
    args: [req.params.id],
  });
  res.json(r.rows);
}));

// POST /farmacias/:id/relatorios  (data = data real do sistema; marca visitada)
farmaciasRouter.post('/:id/relatorios', ah(async (req, res) => {
  const { horario_chegada, duracao_minutos, observacao } = req.body || {};

  const far = await db.execute({ sql: 'SELECT id FROM farmacias WHERE id = ?', args: [req.params.id] });
  if (!far.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });

  const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (data real do sistema)

  const resultado = await db.batch([
    {
      sql: `INSERT INTO relatorios_visita
              (farmacia_id, usuario_id, data_visita, horario_chegada, duracao_minutos, observacao)
            VALUES (?,?,?,?,?,?)`,
      args: [req.params.id, req.usuario.id, hoje, horario_chegada ?? null, duracao_minutos ?? null, observacao ?? null],
    },
    { sql: "UPDATE farmacias SET status_visita = 'visitada' WHERE id = ?", args: [req.params.id] },
  ], 'write');

  const novoId = resultado[0].lastInsertRowid;
  const r = await db.execute({
    sql: `SELECT rv.*, u.nome AS usuario_nome
          FROM relatorios_visita rv JOIN usuarios u ON u.id = rv.usuario_id
          WHERE rv.id = ?`,
    args: [novoId],
  });
  res.status(201).json(r.rows[0]);
}));
