// Política de exclusão de farmácia — pura e testável, consumida pela rota
// DELETE /farmacias/:id. Regras (decisão do cliente):
//  - só 'manual' pode ser excluída;
//  - pedidos vinculados BLOQUEIAM (alimentam o financeiro do Painel/Pedidos —
//    apagar mudaria totais de venda retroativamente);
//  - visitas (relatorios) são apagadas em cascata, consentido no cliente.
export function avaliarExclusao({ origem, pedidos_count = 0, relatorios_count = 0 }) {
  if (origem !== 'manual') return { permitido: false, motivo: 'nao_manual' };
  if (pedidos_count > 0) return { permitido: false, motivo: 'tem_pedidos' };
  return { permitido: true, apagaVisitas: relatorios_count };
}
