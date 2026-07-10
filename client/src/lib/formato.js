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

// Junta partes de texto com ' · ', pulando vazios/nulos/só-espaço. Base comum
// dos formatos de farmácia — nunca gera "undefined" nem separador sobrando.
function juntarComPonto(partes) {
  return partes
    .map((parte) => (parte == null ? '' : String(parte).trim()))
    .filter(Boolean)
    .join(' · ');
}

// Nome identificável da farmácia p/ listas e seletores. Junta nome, bairro e
// rua ("Pague Menos · Ponta Verde · Av. Fernandes Lima") — desambigua filiais de
// mesmo nome. Quando o seed só tem o nome (bairro/endereço vazios, comum no
// Overpass/CNES), devolve só o nome.
export function formatarNomeFarmacia(farmacia) {
  if (!farmacia) return '';
  return juntarComPonto([farmacia.nome, farmacia.bairro, farmacia.endereco]);
}

// Versão compacta (nome + bairro, sem rua) p/ listas apertadas com valor na
// lateral (ex.: rankings do Painel). O bairro sozinho já resolve a maior parte
// da ambiguidade entre filiais e cabe melhor no espaço.
export function formatarNomeFarmaciaCompacto(farmacia) {
  if (!farmacia) return '';
  return juntarComPonto([farmacia.nome, farmacia.bairro]);
}

// Só o endereço (bairro + rua, sem o nome) p/ telas de detalhe onde o nome já
// aparece em destaque separado — ex.: header da Ficha. Mesma ordem/lógica das
// funções acima; devolve '' quando não há bairro nem rua (não renderiza linha).
export function formatarEnderecoFarmacia(farmacia) {
  if (!farmacia) return '';
  return juntarComPonto([farmacia.bairro, farmacia.endereco]);
}

// 'Ricardo Cavalcante' → 'RC'
export function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
