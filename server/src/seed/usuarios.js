import 'dotenv/config';
import { db, enableForeignKeys } from '../db.js';
import { hashSenha } from '../lib/auth.js';

// Equipe inicial (mesmos nomes do design). Senha padrão só para testes —
// trocar em produção. Não há fluxo de auto-cadastro na v1.
const equipe = [
  { nome: 'Ricardo Cavalcante', email: 'ricardo@mapafarma.com', senha: 'mapafarma123' },
  { nome: 'Marina Alves', email: 'marina@mapafarma.com', senha: 'mapafarma123' },
  { nome: 'Josué Santos', email: 'josue@mapafarma.com', senha: 'mapafarma123' },
];

await enableForeignKeys();
for (const u of equipe) {
  const existe = await db.execute({ sql: 'SELECT id FROM usuarios WHERE email = ?', args: [u.email] });
  if (existe.rows.length) { console.log('· já existe:', u.email); continue; }
  const senha_hash = await hashSenha(u.senha);
  await db.execute({
    sql: 'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?,?,?)',
    args: [u.nome, u.email, senha_hash],
  });
  console.log('✓ criado:', u.email, '(senha:', u.senha + ')');
}
console.log('Seed de usuários concluído.');
process.exit(0);
