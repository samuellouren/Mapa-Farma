import { Router } from 'express';
import { db } from '../db.js';
import { autenticar } from '../middleware/auth.js';
import { ah } from '../lib/asyncHandler.js';

export const usuariosRouter = Router();
usuariosRouter.use(autenticar);

// GET /usuarios  (equipe — nunca expõe senha_hash)
usuariosRouter.get('/', ah(async (req, res) => {
  const r = await db.execute('SELECT id, nome, email, criado_em FROM usuarios ORDER BY nome');
  res.json(r.rows);
}));
