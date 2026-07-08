// Tradução dos VALORES DO BANCO (que a API retorna) para rótulo + cor de
// exibição. Fonte de verdade dos valores: skill schema-turso. O app trabalha
// sempre com os valores do banco; esta camada só cuida da apresentação.
import { cores } from '../theme';

export const STATUS_VISITA = {
  nao_visitada: { label: 'Não visitada', cor: cores.textoFraco },
  a_visitar: { label: 'A visitar', cor: cores.ambar },
  visitada: { label: 'Visitada', cor: cores.verdeEscuro },
};

export const PERFIL_PAGAMENTO = {
  paga_em_dia: { label: 'Paga em dia', cor: cores.verdeEscuro },
  atrasa: { label: 'Atrasa', cor: cores.ambar },
  nao_paga: { label: 'Não paga', cor: cores.vermelho },
};

export const PERFIL_COMPRA = {
  compra_bem: { label: 'Compra bem', cor: cores.verdeEscuro },
  compra_pouco: { label: 'Compra pouco', cor: cores.ambar },
  nao_compra: { label: 'Não compra', cor: cores.textoMudo },
};

export const STATUS_PAGAMENTO = {
  pago: { label: 'Pago', cor: cores.verdeEscuro },
  atrasado: { label: 'Atrasado', cor: cores.ambar },
  nao_pago: { label: 'Não pago', cor: cores.vermelho },
};

export const relacaoLabel = (ehCliente) => (ehCliente ? 'Cliente' : 'Não cliente');
