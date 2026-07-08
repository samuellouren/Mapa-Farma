import 'dotenv/config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-troque-em-producao';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

export function hashSenha(senha) {
  return bcrypt.hash(senha, 10);
}

export function conferirSenha(senha, hash) {
  return bcrypt.compare(senha, hash);
}

export function gerarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, nome: usuario.nome, email: usuario.email },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

export function verificarToken(token) {
  return jwt.verify(token, SECRET);
}
