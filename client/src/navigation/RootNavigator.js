import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { useAuth } from '../lib/auth';
import { cores } from '../theme';
import LoginScreen from '../screens/LoginScreen';
import TabNavigator from './TabNavigator';

const AuthStack = createNativeStackNavigator();

export default function RootNavigator() {
  const { token, carregando } = useAuth();
  const [fontesProntas] = useFonts({ IBMPlexMono_500Medium, IBMPlexMono_600SemiBold });

  if (carregando || !fontesProntas) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={cores.branco} size="large" />
      </View>
    );
  }

  if (!token) {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
      </AuthStack.Navigator>
    );
  }

  return <TabNavigator />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: cores.vinho, alignItems: 'center', justifyContent: 'center' },
});
