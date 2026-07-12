// Perfil de pagamento EFETIVO da farmácia.
// Fonte única: override manual (farmacias.perfil_pagamento) vence; quando NULL,
// deriva do status do pedido mais recente. Sem manual e sem pedido → NULL.

export const STATUS_PARA_PERFIL = { pago: 'paga_em_dia', atrasado: 'atrasa', nao_pago: 'nao_paga' };

// Fragmento SQL do perfil derivado SÓ do pedido mais recente (ignora o campo
// manual): status do pedido mais recente mapeado, ou NULL se não há pedido.
// Usado no Painel (carteira, "por cliente", ranking), onde o perfil precisa
// refletir fato de cobrança, não avaliação manual que pode estar desatualizada.
// `alias` é o alias da tabela farmacias na query (sempre literal de código —
// NUNCA input do usuário).
export function sqlPerfilPedido(alias = 'f') {
  return `CASE (SELECT p.status_pagamento FROM pedidos p
          WHERE p.farmacia_id = ${alias}.id
          ORDER BY p.data_pedido DESC, p.id DESC LIMIT 1)
      WHEN 'pago'     THEN 'paga_em_dia'
      WHEN 'atrasado' THEN 'atrasa'
      WHEN 'nao_pago' THEN 'nao_paga'
    END`;
}

// Fragmento SQL do perfil EFETIVO: override manual (farmacias.perfil_pagamento)
// vence; quando NULL, cai no perfil derivado do pedido. Usado na Ficha, filtro
// do Mapa e badge do marcador.
export function sqlPerfilEfetivo(alias = 'f') {
  return `COALESCE(${alias}.perfil_pagamento, ${sqlPerfilPedido(alias)})`;
}
