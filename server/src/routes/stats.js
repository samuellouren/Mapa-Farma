import { Router } from 'express';
import { db } from '../db.js';
import { autenticar } from '../middleware/auth.js';
import { ah } from '../lib/asyncHandler.js';

export const statsRouter = Router();
statsRouter.use(autenticar);

// Pesos que replicam o ranking "melhores clientes" do design.
const PESO_COMPRA = { compra_bem: 3, compra_pouco: 1, nao_compra: 0 };
const PESO_PAGAMENTO = { paga_em_dia: 2, atrasa: 0, nao_paga: -2 };

// GET /stats?periodo=7|30|90  (sempre calculado por query, sem tabela pré-agregada)
statsRouter.get('/', ah(async (req, res) => {
  const periodo = [7, 30, 90].includes(Number(req.query.periodo)) ? Number(req.query.periodo) : 30;
  const desde = `-${periodo} days`;

  const vis = await db.execute({
    sql: `SELECT COUNT(*) AS total, COUNT(DISTINCT farmacia_id) AS farmacias
          FROM relatorios_visita WHERE data_visita >= date('now', ?)`,
    args: [desde],
  });

  const vendedores = await db.execute({
    sql: `SELECT u.id, u.nome, COUNT(*) AS visitas
          FROM relatorios_visita rv JOIN usuarios u ON u.id = rv.usuario_id
          WHERE rv.data_visita >= date('now', ?)
          GROUP BY u.id ORDER BY visitas DESC`,
    args: [desde],
  });

  const pag = await db.execute(
    `SELECT perfil_pagamento, COUNT(*) AS n FROM farmacias
     WHERE perfil_pagamento IS NOT NULL GROUP BY perfil_pagamento`
  );

  const fs = await db.execute(
    `SELECT f.id, f.nome, f.bairro, f.eh_cliente, f.perfil_pagamento, f.perfil_compra,
            (SELECT COUNT(*) FROM relatorios_visita rv WHERE rv.farmacia_id = f.id) AS total_relatorios,
            (SELECT MAX(rv.data_visita) FROM relatorios_visita rv WHERE rv.farmacia_id = f.id) AS ultima_visita
     FROM farmacias f`
  );

  const hoje = new Date();
  const diasDesde = (d) => (d ? Math.round((hoje - new Date(d)) / 86400000) : null);
  const linhas = fs.rows.map((f) => ({ ...f, dias_sem_visita: diasDesde(f.ultima_visita) }));

  const topClientes = linhas
    .filter((f) => f.eh_cliente)
    .map((f) => ({
      ...f,
      score: (PESO_COMPRA[f.perfil_compra] || 0) + (PESO_PAGAMENTO[f.perfil_pagamento] || 0) + f.total_relatorios * 0.5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((f) => ({ id: f.id, nome: f.nome, bairro: f.bairro, perfil_compra: f.perfil_compra, perfil_pagamento: f.perfil_pagamento }));

  const semVisita = linhas
    .slice()
    .sort((a, b) => (b.dias_sem_visita ?? 1e9) - (a.dias_sem_visita ?? 1e9))
    .slice(0, 4)
    .map((f) => ({ id: f.id, nome: f.nome, bairro: f.bairro, dias_sem_visita: f.dias_sem_visita }));

  const carteira = { paga_em_dia: 0, atrasa: 0, nao_paga: 0 };
  pag.rows.forEach((r) => { carteira[r.perfil_pagamento] = r.n; });

  const perfilPagamentoClientes = linhas
    .filter((f) => f.perfil_pagamento)
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((f) => ({ id: f.id, nome: f.nome, perfil_pagamento: f.perfil_pagamento }));

  res.json({
    periodo,
    visitas_periodo: vis.rows[0].total,
    farmacias_visitadas: vis.rows[0].farmacias,
    por_vendedor: vendedores.rows,
    perfil_pagamento_carteira: carteira,
    perfil_pagamento_clientes: perfilPagamentoClientes,
    top_clientes: topClientes,
    sem_visita_ha_mais_tempo: semVisita,
  });
}));
