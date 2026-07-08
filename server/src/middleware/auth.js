import { verificarToken } from '../lib/auth.js';

// Exige um Bearer token válido. Popula req.usuario = { id, nome, email }.
export function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const [esquema, token] = header.split(' ');
  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token ausente' });
  }
  try {
    const payload = verificarToken(token);
    req.usuario = { id: payload.sub, nome: payload.nome, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}
