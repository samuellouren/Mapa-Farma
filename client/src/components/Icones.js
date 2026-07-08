// Ícones replicados 1:1 dos SVGs do design Mapa_Farma.html.
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';

export function IconeMapa({ cor, tamanho = 23, preenchido = 'none' }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 23 23" fill="none">
      <Path
        d="M11.5 2.5c-3.6 0-6.5 2.8-6.5 6.3 0 4.6 6.5 11.2 6.5 11.2s6.5-6.6 6.5-11.2c0-3.5-2.9-6.3-6.5-6.3Z"
        stroke={cor} strokeWidth={1.8} fill={preenchido}
      />
      <Circle cx={11.5} cy={8.8} r={2.4} fill={cor} />
    </Svg>
  );
}

export function IconePedidos({ cor, tamanho = 23 }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 23 23" fill="none">
      <Path d="M6 3h11v17l-2-1.4-1.8 1.4-1.8-1.4-1.8 1.4L8 18.6 6 20V3Z" stroke={cor} strokeWidth={1.7} strokeLinejoin="round" />
      <Line x1={9} y1={8} x2={14} y2={8} stroke={cor} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={9} y1={11.6} x2={14} y2={11.6} stroke={cor} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function IconePainel({ cor, tamanho = 23 }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 23 23" fill="none">
      <Rect x={3} y={12} width={4} height={8} rx={1} fill={cor} />
      <Rect x={9.5} y={7} width={4} height={13} rx={1} fill={cor} />
      <Rect x={16} y={3.5} width={4} height={16.5} rx={1} fill={cor} />
    </Svg>
  );
}

export function IconeConta({ cor, tamanho = 23 }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 23 23" fill="none">
      <Circle cx={11.5} cy={7.6} r={3.6} stroke={cor} strokeWidth={1.7} />
      <Path d="M4.8 19c0-3.5 3-5.9 6.7-5.9s6.7 2.4 6.7 5.9" stroke={cor} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function IconeBusca({ cor = '#9a9aa2', tamanho = 17 }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 17 17" fill="none">
      <Circle cx={7.2} cy={7.2} r={5.3} stroke={cor} strokeWidth={1.8} />
      <Line x1={11.2} y1={11.2} x2={15} y2={15} stroke={cor} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function IconeFiltro({ cor = '#7a2833', fundo = '#fff', tamanho = 19 }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 19 19" fill="none">
      <Line x1={2} y1={5} x2={17} y2={5} stroke={cor} strokeWidth={1.9} strokeLinecap="round" />
      <Line x1={2} y1={10} x2={17} y2={10} stroke={cor} strokeWidth={1.9} strokeLinecap="round" />
      <Line x1={2} y1={15} x2={17} y2={15} stroke={cor} strokeWidth={1.9} strokeLinecap="round" />
      <Circle cx={12} cy={5} r={2.8} fill={cor} stroke={fundo} strokeWidth={1.6} />
      <Circle cx={6} cy={10} r={2.8} fill={cor} stroke={fundo} strokeWidth={1.6} />
      <Circle cx={13} cy={15} r={2.8} fill={cor} stroke={fundo} strokeWidth={1.6} />
    </Svg>
  );
}

export function IconeRota({ cor = '#7a2833', tamanho = 17 }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 17 17" fill="none">
      <Path d="M8.5 1.5 15.5 8.5 8.5 15.5 1.5 8.5Z" stroke={cor} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M6 9.5V8a2 2 0 0 1 2-2h3M9.2 4.2 11 6l-1.8 1.8" stroke={cor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconeLocalizacao({ cor = '#7a2833', tamanho = 22 }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 22 22" fill="none">
      <Circle cx={11} cy={11} r={4} stroke={cor} strokeWidth={1.8} />
      <Line x1={11} y1={1.5} x2={11} y2={4} stroke={cor} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={11} y1={18} x2={11} y2={20.5} stroke={cor} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={1.5} y1={11} x2={4} y2={11} stroke={cor} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={18} y1={11} x2={20.5} y2={11} stroke={cor} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
