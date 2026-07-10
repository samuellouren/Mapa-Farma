// Extrai endereço/bairro da resposta do reverse do Nominatim, no mesmo formato
// que os seeds gravam (endereco = "Rua, número"; bairro = suburb/bairro). Puro
// e sem rede — testável isoladamente. Campos ausentes viram null (nunca "").

const limpo = (s) => {
  const t = s == null ? '' : String(s).trim();
  return t || null;
};

export function extrairEndereco(json) {
  const a = json?.address;
  if (!a) return { endereco: null, bairro: null };
  const road = limpo(a.road);
  const numero = limpo(a.house_number);
  const endereco = road ? (numero ? `${road}, ${numero}` : road) : null;
  const bairro = limpo(a.suburb) || limpo(a.neighbourhood) || limpo(a.city_district);
  return { endereco, bairro };
}

// Um resultado do search (forward) do Nominatim → forma enxuta pro cliente.
// `label` é um rótulo curto pra lista (endereço+bairro, ou o começo do
// display_name). lat/lng viram null se inválidos (a rota descarta esses).
export function formatarResultadoBusca(item) {
  const { endereco, bairro } = extrairEndereco(item);
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  const label = [endereco, bairro].filter(Boolean).join(' · ')
    || (item?.display_name ? item.display_name.split(',').slice(0, 2).join(',').trim() : 'Local');
  // `preciso`: o resultado tem número de porta (casa/prédio/POI no OSM). Quando
  // false, o ponto é o centroide da RUA — o cliente avisa que o usuário deve
  // arrastar o pino pra pegar o número exato (a maioria das ruas de Maceió não
  // tem numeração mapeada no OSM; sem isso o app parece "ter errado").
  const preciso = limpo(item?.address?.house_number) != null;
  return {
    label,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    endereco,
    bairro,
    preciso,
  };
}
