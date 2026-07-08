import { Router } from 'express';
import { db } from '../db.js';
import { conferirSenha, gerarToken } from '../lib/auth.js';
import { autenticar } from '../middleware/auth.js';
import { ah } from '../lib/asyncHandler.js';

export const authRouter = Router();

// POST /auth/login  { email, senha }
authRouter.post('/login', ah(async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ erro: 'Informe email e senha' });

  const r = await db.execute({ sql: 'SELECT * FROM usuarios WHERE email = ?', args: [email] });
  const u = r.rows[0];
  if (!u) return res.status(401).json({ erro: 'Credenciais inválidas' });

  const ok = await conferirSenha(senha, u.senha_hash);
  if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas' });

  const usuario = { id: u.id, nome: u.nome, email: u.email };
  res.json({ token: gerarToken(usuario), usuario });
}));

// GET /auth/me  (protegida)
authRouter.get('/me', autenticar, ah(async (req, res) => {
  const r = await db.execute({
    sql: 'SELECT id, nome, email, criado_em FROM usuarios WHERE id = ?',
    args: [req.usuario.id],
  });
  if (!r.rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado' });
  res.json(r.rows[0]);
}));
