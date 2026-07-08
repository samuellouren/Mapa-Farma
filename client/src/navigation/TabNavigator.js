import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabBar from '../components/TabBar';
import MapaScreen from '../screens/MapaScreen';
import FichaScreen from '../screens/FichaScreen';
import RegistrarScreen from '../screens/RegistrarScreen';
import EmBreve from '../screens/EmBreve';

const Tab = createBottomTabNavigator();
const MapaStack = createNativeStackNavigator();

// Stubs estáveis (referência fixa) para telas ainda não construídas.
const HistoricoStub = () => <EmBreve titulo="Histórico" />;
const PedidosStub = () => <EmBreve titulo="Pedidos" />;
const PainelStub = () => <EmBreve titulo="Estatísticas" />;
const ContaStub = () => <EmBreve titulo="Conta" />;

// A aba Mapa é um stack: Mapa → Ficha → Registrar → Histórico
// (Histórico ainda é stub, entra na próxima etapa).
function MapaStackScreen() {
  return (
    <MapaStack.Navigator screenOptions={{ headerShown: false }}>
      <MapaStack.Screen name="MapaHome" component={MapaScreen} />
      <MapaStack.Screen name="Ficha" component={FichaScreen} />
      <MapaStack.Screen name="Registrar" component={RegistrarScreen} />
      <MapaStack.Screen name="Historico" component={HistoricoStub} />
    </MapaStack.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tab.Screen name="Mapa" component={MapaStackScreen} />
      <Tab.Screen name="Pedidos" component={PedidosStub} />
      <Tab.Screen name="Painel" component={PainelStub} />
      <Tab.Screen name="Conta" component={ContaStub} />
    </Tab.Navigator>
  );
}
