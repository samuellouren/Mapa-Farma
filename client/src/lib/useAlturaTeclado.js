import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

// Altura do teclado em pixels (0 quando fechado). Usado para levantar bottom
// sheets acima do teclado — no Android, Modais não sobem sozinhos quando um
// campo mais abaixo ganha foco.
export function useAlturaTeclado() {
  const [altura, setAltura] = useState(0);
  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', (e) => setAltura(e.endCoordinates.height));
    const esconder = Keyboard.addListener('keyboardDidHide', () => setAltura(0));
    return () => { mostrar.remove(); esconder.remove(); };
  }, []);
  return altura;
}
