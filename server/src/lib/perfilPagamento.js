// Perfil de pagamento EFETIVO da farmácia.
// Fonte única: override manual (farmacias.perfil_pagamento) vence; quando NULL,
// deriva do status do pedido mais recente. Sem manual e sem pedido → NULL.

export const STATUS_PARA_PERFIL = { pago: 'paga_em_dia', atrasado: 'atrasa', nao_pago: 'nao_paga' };

// Fragmento SQL do perfil efetivo. `alias` é o alias da tabela farmacias na
// query (sempre literal de código — NUNCA input do usuário).
export function sqlPerfilEfetivo(alias = 'f') {
  return `COALESCE(${alias}.perfil_pagamento,
    CASE (SELECT p.status_pagamento FROM pedidos p
          WHERE p.farmacia_id = ${alias}.id
          ORDER BY p.data_pedido DESC, p.id DESC LIMIT 1)
      WHEN 'pago'     THEN 'paga_em_dia'
      WHEN 'atrasado' THEN 'atrasa'
      WHEN 'nao_pago' THEN 'nao_paga'
    END)`;
}
