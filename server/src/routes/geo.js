import { Router } from 'express';
import { autenticar } from '../middleware/auth.js';
import { ah } from '../lib/asyncHandler.js';
import { dentroDeMaceio } from '../lib/limite-maceio.js';
import { extrairEndereco, formatarResultadoBusca } from '../lib/geocode.js';

export const geoRouter = Router();
geoRouter.use(autenticar);

const UA = 'MapaFarma/1.0 (apoio comercial; contato: samuel.lourenco.sls@gmail.com)';
const TIMEOUT_MS = 4000;

// GET /geo/reverse?lat=&lng=  →  { endereco, bairro, dentro_maceio }
// `dentro_maceio` vem do NOSSO polígono (dentroDeMaceio), independente do
// Nominatim: se o Nominatim cair/demorar, ainda validamos e só o endereço volta
// vazio. Usado pelo seletor de localização ao "Confirmar".
geoRouter.get('/reverse', ah(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ erro: 'lat e lng são obrigatórias e numéricas' });
  }
  const dentro_maceio = dentroDeMaceio(lng, lat);

  let endereco = null;
  let bairro = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1`;
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (r.ok) ({ endereco, bairro } = extrairEndereco(await r.json()));
  } catch {
    // Nominatim indisponível/lento → segue com endereço vazio; validação garantida.
  } finally {
    clearTimeout(timer);
  }
  res.json({ endereco, bairro, dentro_maceio });
}));

// GET /geo/buscar?q=  →  { resultados: [{ label, latitude, longitude, endereco, bairro }] }
// Forward geocoding via Nominatim, restrito à área de Maceió (viewbox+bounded) e
// filtrado pelo nosso polígono — resultados fora da cidade nem entram na lista.
// Usado pela barra de busca do seletor de localização.
geoRouter.get('/buscar', ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ erro: 'Digite ao menos 3 caracteres.' });

  let resultados = [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      q, format: 'jsonv2', addressdetails: '1', limit: '6',
      countrycodes: 'br', viewbox: '-35.80,-9.38,-35.60,-9.72', bounded: '1',
    });
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': UA }, signal: ctrl.signal,
    });
    if (r.ok) {
      const arr = await r.json();
      resultados = (Array.isArray(arr) ? arr : [])
        .map(formatarResultadoBusca)
        .filter((x) => x.latitude != null && x.longitude != null && dentroDeMaceio(x.longitude, x.latitude))
        .slice(0, 4);
    }
  } catch {
    // rede/timeout → lista vazia; o cliente mostra "nada encontrado".
  } finally {
    clearTimeout(timer);
  }
  res.json({ resultados });
}));
