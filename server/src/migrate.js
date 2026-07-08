import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, enableForeignKeys } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, 'migrations');

await enableForeignKeys();
await db.execute(
  `CREATE TABLE IF NOT EXISTS _migrations (
     nome TEXT PRIMARY KEY,
     aplicada_em DATETIME NOT NULL DEFAULT (datetime('now'))
   )`
);

const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const arq of arquivos) {
  const ja = await db.execute({ sql: 'SELECT 1 FROM _migrations WHERE nome = ?', args: [arq] });
  if (ja.rows.length) { console.log('· já aplicada:', arq); continue; }
  const sql = readFileSync(join(dir, arq), 'utf8');
  await db.executeMultiple(sql);
  await db.execute({ sql: 'INSERT INTO _migrations (nome) VALUES (?)', args: [arq] });
  console.log('✓ aplicada:', arq);
}
console.log('Migrations concluídas.');
process.exit(0);
