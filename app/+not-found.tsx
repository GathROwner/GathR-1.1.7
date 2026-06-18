import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const BRAND = {
  primary: '#1E90FF',
  primaryDark: '#0066CC',
  ink: '#1F2937',
  muted: '#667085',
  border: '#D8E2EF',
  surface: '#FFFFFF',
  background: '#F4F8FC',
};

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.panel}>
          <View style={styles.icon}>
            <ActivityIndicator color={BRAND.primaryDark} />
          </View>
          <Text style={styles.title}>Opening GathR</Text>
          <Text style={styles.detail}>Preparing your share...</Text>
          <Pressable style={styles.button} onPress={() => router.replace('/(tabs)/map')}>
            <Text style={styles.buttonText}>Go to GathR</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: BRAND.background,
  },
  panel: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 14,
    backgroundColor: BRAND.surface,
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  icon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#EAF4FF',
    marginBottom: 14,
  },
  title: {
    color: BRAND.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  detail: {
    color: BRAND.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 6,
  },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: BRAND.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 18,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
