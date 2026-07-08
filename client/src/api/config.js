import Constants from 'expo-constants';

// Em desenvolvimento, o app roda num celular/emulador e NÃO enxerga
// "localhost" (isso seria o próprio aparelho). Derivamos o IP da máquina de
// desenvolvimento a partir do host do Metro (ex.: 192.168.0.10) e batemos na
// porta 3001 do backend.
//
// Em produção, defina API_URL_PRODUCAO com a URL pública do backend.
const API_URL_PRODUCAO = null; // ex.: 'https://api.mapafarma.com'

function urlDev() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3001` : 'http://localhost:3001';
}

export const API_URL = API_URL_PRODUCAO || urlDev();
