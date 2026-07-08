import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabBar from '../components/TabBar';
import MapaScreen from '../screens/MapaScreen';
import EmBreve from '../screens/EmBreve';

const Tab = createBottomTabNavigator();
const MapaStack = createNativeStackNavigator();

// Stubs estáveis (referência fixa) para telas ainda não construídas.
const FichaStub = () => <EmBreve titulo="Ficha da farmácia" />;
const PedidosStub = () => <EmBreve titulo="Pedidos" />;
const PainelStub = () => <EmBreve titulo="Estatísticas" />;
const ContaStub = () => <EmBreve titulo="Conta" />;

// A aba Mapa é um stack: Mapa → Ficha → Registrar → Histórico
// (as 3 últimas ainda são stubs, entram nas próximas etapas).
function MapaStackScreen() {
  return (
    <MapaStack.Navigator screenOptions={{ headerShown: false }}>
      <MapaStack.Screen name="MapaHome" component={MapaScreen} />
      <MapaStack.Screen name="Ficha" component={FichaStub} />
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
