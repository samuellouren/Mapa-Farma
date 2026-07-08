// Tokens visuais extraídos do design Mapa_Farma.html (cores, espaçamento,
// tipografia). Fonte da identidade visual do app.

export const cores = {
  vinho: '#7a2833',        // cor principal (headers, botões, tab ativa)
  vinhoEscuro: '#6a2029',
  verde: '#16a34a',        // farmácia cliente
  verdeEscuro: '#15803d',  // "em dia" / positivo
  ambar: '#b45309',        // "atrasa" / atenção
  vermelho: '#b91c1c',     // "não paga" / negativo

  texto: '#18181b',
  texto2: '#27272a',
  textoSuave: '#52525b',
  textoMudo: '#71717a',
  textoFraco: '#a1a1aa',

  borda: '#ececee',
  borda2: '#e4e4e7',
  borda3: '#d4d4d8',

  fundo: '#f4f4f5',        // fundo das telas
  fundoMapa: '#e9e6df',
  branco: '#ffffff',
  cinzaNaoCliente: '#8b95a1', // borda do marcador não-cliente
};

export const fontes = {
  // Fonte de sistema para texto normal; IBM Plex Mono para números/contadores.
  mono500: 'IBMPlexMono_500Medium',
  mono600: 'IBMPlexMono_600SemiBold',
};

export const espaco = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

export const raio = { sm: 8, md: 11, lg: 14, xl: 20, pill: 22, full: 999 };
