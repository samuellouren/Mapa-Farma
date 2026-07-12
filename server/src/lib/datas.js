// 'YYYY-MM-DD' válido? (formato estrito + data real). Vazio/null → tratado fora.
export function dataISOValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}
