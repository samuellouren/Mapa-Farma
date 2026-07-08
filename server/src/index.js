import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { enableForeignKeys } from './db.js';
import { authRouter } from './routes/auth.js';
import { farmaciasRouter } from './routes/farmacias.js';
import { pedidosRouter } from './routes/pedidos.js';
import { statsRouter } from './routes/stats.js';
import { usuariosRouter } from './routes/usuarios.js';

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck / raiz
app.get('/', (req, res) => res.json({ app: 'Mapa Farma API', ok: true }));

app.use('/auth', authRouter);
app.use('/farmacias', farmaciasRouter);
app.use('/pedidos', pedidosRouter);
app.use('/stats', statsRouter);
app.use('/usuarios', usuariosRouter);

// Middleware de erro (recebe erros dos handlers async via asyncHandler)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno', detalhe: String(err?.message || err) });
});

const PORT = process.env.PORT || 3001;
await enableForeignKeys();
app.listen(PORT, () => console.log(`Mapa Farma API em http://localhost:${PORT}`));
