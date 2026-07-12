// 'YYYY-MM-DD' válido? (formato estrito + data real). Vazio/null → tratado fora.
// Checagem por inteiros, sem Date — independente do fuso do host.
export function dataISOValida(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  const bissexto = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d >= 1 && d <= diasNoMes;
}
