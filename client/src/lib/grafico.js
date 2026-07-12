// Agrupamento dos pedidos para o gráfico "Vendas em R$".
//
// modo 'mes'    → uma barra por mês (últimos 7 meses com pedido), soma do mês.
// modo 'semana' → 7 barras fixas (seg..dom) da SEMANA CORRENTE (ISO, segunda a
//                 domingo, ancorada em `hoje`), cada uma somando o vendido
//                 naquele dia. Dias sem pedido aparecem zerados; pedidos fora
//                 da semana corrente ficam de fora.

const DIAS_ABREV = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Data local → 'AAAA-MM-DD' (componentes locais, mesmo formato de data_pedido).
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function agrupar(pedidos, modo, hoje = new Date()) {
  if (modo === 'semana') {
    // Segunda-feira da semana corrente (mesma convenção do resto do app).
    const seg = new Date(hoje);
    seg.setHours(0, 0, 0, 0);
    seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));

    // 7 buckets fixos seg..dom, zerados, indexados pela data local ('AAAA-MM-DD').
    const dias = [];
    const porData = new Map();
    for (let i = 0; i < 7; i++) {
      const d = new Date(seg);
      d.setDate(seg.getDate() + i);
      const b = { chave: ymd(d), label: DIAS_ABREV[i], total: 0 };
      dias.push(b);
      porData.set(b.chave, b);
    }
    // Soma cada pedido no dia correspondente (comparação direta de string de
    // data — sem parse, imune a fuso). Pedido fora da semana é ignorado.
    for (const p of pedidos) {
      const b = porData.get(String(p.data_pedido).slice(0, 10));
      if (b) b.total += p.valor_centavos;
    }
    return dias;
  }

  // modo 'mes': um bucket por mês, os 7 mais recentes em ordem cronológica.
  const buckets = new Map();
  for (const p of pedidos) {
    const d = new Date(String(p.data_pedido).slice(0, 10) + 'T00:00:00');
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const b = buckets.get(chave) || { chave, label: MESES_ABREV[d.getMonth()], total: 0 };
    b.total += p.valor_centavos;
    buckets.set(chave, b);
  }
  return [...buckets.values()].sort((a, b) => a.chave.localeCompare(b.chave)).slice(-7);
}
