import { Router } from 'express';
import { db } from '../db.js';
import { autenticar } from '../middleware/auth.js';
import { ah } from '../lib/asyncHandler.js';
import { STATUS_VISITA, PERFIL_PAGAMENTO, PERFIL_COMPRA } from '../lib/enums.js';
import { dentroDeMaceio } from '../lib/limite-maceio.js';
import { avaliarExclusao } from '../lib/exclusao.js';
import { sqlPerfilEfetivo } from '../lib/perfilPagamento.js';

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
  if (perfil_pagamento) { where.push(`${sqlPerfilEfetivo('f')} = ?`); args.push(perfil_pagamento); }

  const sql =
    `SELECT f.*, ${sqlPerfilEfetivo('f')} AS perfil_pagamento_efetivo FROM farmacias f` +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY nome';
  const r = await db.execute({ sql, args });
  res.json(r.rows);
}));

// GET /farmacias/:id  (ficha) — inclui contagem de vínculos p/ a exclusão
farmaciasRouter.get('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.execute({
    sql: `SELECT f.*,
            ${sqlPerfilEfetivo('f')} AS perfil_pagamento_efetivo,
            (SELECT COUNT(*) FROM relatorios_visita WHERE farmacia_id = f.id) AS relatorios_count,
            (SELECT COUNT(*) FROM pedidos          WHERE farmacia_id = f.id) AS pedidos_count
          FROM farmacias f WHERE f.id = ?`,
    args: [req.params.id],
  });
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
    sql: 'INSERT INTO farmacias (nome, endereco, bairro, latitude, longitude, origem) VALUES (?,?,?,?,?, \'manual\')',
    args: [String(nome).trim(), endereco ?? null, bairro ?? null, lat, lng],
  });
  const r = await db.execute({ sql: 'SELECT * FROM farmacias WHERE id = ?', args: [ins.lastInsertRowid] });
  res.status(201).json(r.rows[0]);
}));

// PATCH /farmacias/:id
//  - negócio (eh_cliente, status_visita, perfis): livre p/ qualquer farmácia.
//  - identidade (nome, endereco, bairro, latitude, longitude): só origem='manual'.
farmaciasRouter.patch('/:id', ah(async (req, res) => {
  const b = req.body || {};
  const { eh_cliente, status_visita, perfil_pagamento, perfil_compra,
          nome, endereco, bairro, latitude, longitude } = b;

  const CAMPOS_IDENTIDADE = ['nome', 'endereco', 'bairro', 'latitude', 'longitude'];
  const temIdentidade = CAMPOS_IDENTIDADE.some((k) => b[k] !== undefined);

  if (temIdentidade) {
    const atual = await db.execute({ sql: 'SELECT origem FROM farmacias WHERE id = ?', args: [req.params.id] });
    if (!atual.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
    if (atual.rows[0].origem !== 'manual') {
      return res.status(403).json({ erro: 'Só farmácias adicionadas manualmente podem ser editadas.' });
    }
  }

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

  if (nome !== undefined) {
    if (!String(nome).trim()) return res.status(400).json({ erro: 'nome não pode ser vazio' });
    campos.push('nome = ?'); args.push(String(nome).trim());
  }
  if (endereco !== undefined) { campos.push('endereco = ?'); args.push(endereco ? String(endereco).trim() : null); }
  if (bairro !== undefined) { campos.push('bairro = ?'); args.push(bairro ? String(bairro).trim() : null); }
  if (latitude !== undefined || longitude !== undefined) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
      return res.status(400).json({ erro: 'latitude e longitude devem ser numéricas' });
    if (!dentroDeMaceio(lng, lat))
      return res.status(400).json({ erro: 'Coordenada fora dos limites de Maceió' });
    campos.push('latitude = ?', 'longitude = ?'); args.push(lat, lng);
  }

  if (!campos.length) return res.status(400).json({ erro: 'Nada para atualizar' });

  args.push(req.params.id);
  await db.execute({ sql: `UPDATE farmacias SET ${campos.join(', ')} WHERE id = ?`, args });
  const r = await db.execute({
    sql: `SELECT f.*, ${sqlPerfilEfetivo('f')} AS perfil_pagamento_efetivo FROM farmacias f WHERE f.id = ?`,
    args: [req.params.id],
  });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Farmácia não encontrada' });
  res.json(r.rows[0]);
}));

// DELETE /farmacias/:id  — só manual; bloqueia se houver pedidos; cascata em visitas
farmaciasRouter.delete('/:id(\\d+)', ah(async (req, res) => {
  const r = await db.execute({
    sql: `SELECT origem,
            (SELECT COUNT(*) FROM relatorios_visita WHERE farmacia_id = ?) AS relatorios_count,
            (SELECT COUNT(*) FROM pedidos          WHERE farmacia_id = ?) AS pedidos_count
          FROM farmacias WHERE id = ?`,
    args: [req.params.id, req.params.id, req.params.id],
  });
  const row = r.rows[0];
  if (!row) return res.status(404).json({ erro: 'Farmácia não encontrada' });

  const d = avaliarExclusao(row);
  if (!d.permitido) {
    if (d.motivo === 'nao_manual') {
      return res.status(403).json({ erro: 'Só farmácias adicionadas manualmente podem ser excluídas.' });
    }
    return res.status(409).json({
      erro: 'Esta farmácia tem pedidos registrados e não pode ser excluída (preserva o histórico de vendas).',
      pedidos_count: row.pedidos_count,
    });
  }

  // Exclusão atômica e independente de ON DELETE CASCADE: em libSQL remoto o
  // PRAGMA foreign_keys=ON setado no startup não garante cascata em toda
  // sessão/statement, então apagamos relatorios_visita explicitamente. O
  // guard NOT EXISTS(pedidos) roda dentro da mesma transação (db.batch) para
  // fechar a janela TOCTOU entre o SELECT de contagem acima e o DELETE: se um
  // pedido for inserido nesse meio-tempo, nada é apagado.
  const resultado = await db.batch([
    {
      sql: `DELETE FROM relatorios_visita WHERE farmacia_id = ?
              AND NOT EXISTS (SELECT 1 FROM pedidos WHERE farmacia_id = ?)`,
      args: [req.params.id, req.params.id],
    },
    {
      sql: `DELETE FROM farmacias WHERE id = ?
              AND NOT EXISTS (SELECT 1 FROM pedidos WHERE farmacia_id = ?)`,
      args: [req.params.id, req.params.id],
    },
  ], 'write');

  const [delVisitas, delFarmacia] = resultado;
  if (Number(delFarmacia.rowsAffected) === 0) {
    // Pedido apareceu na corrida entre o SELECT e o DELETE: recontar e bloquear.
    const recontagem = await db.execute({
      sql: 'SELECT COUNT(*) AS pedidos_count FROM pedidos WHERE farmacia_id = ?',
      args: [req.params.id],
    });
    return res.status(409).json({
      erro: 'Esta farmácia tem pedidos registrados e não pode ser excluída (preserva o histórico de vendas).',
      pedidos_count: recontagem.rows[0].pedidos_count,
    });
  }

  res.json({ ok: true, visitas_apagadas: Number(delVisitas.rowsAffected) });
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
