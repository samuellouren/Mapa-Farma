// Datas/números pt-BR sem depender de Intl (Hermes nem sempre traz ICU completo).
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataHojeExtenso() {
  const d = new Date();
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

// 'AAAA-MM-DD...' → 'DD/MM/AAAA'
export function dataCurta(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export const duracaoLabel = (min) => (min ? `${min} min` : '');

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// centavos (inteiro) → 'R$ 1.234,56'
export function moedaBRL(centavos) {
  const v = (Number(centavos || 0) / 100).toFixed(2);
  const [int, dec] = v.split('.');
  return 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

// 'AAAA-MM-DD...' → '07 jul 2026'
export function dataCurtaMes(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d} ${MESES_ABREV[Number(m) - 1]} ${a}`;
}

// 'Ricardo Cavalcante' → 'RC'
export function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
