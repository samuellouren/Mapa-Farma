import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_URL || 'file:./mapa_farma.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

// intMode:'number' evita BigInt (que quebra JSON.stringify) para ids/inteiros.
export const db = createClient({ url, authToken, intMode: 'number' });

// Chaves estrangeiras precisam ser habilitadas por conexão no SQLite/libSQL.
export async function enableForeignKeys() {
  await db.execute('PRAGMA foreign_keys = ON;');
}
