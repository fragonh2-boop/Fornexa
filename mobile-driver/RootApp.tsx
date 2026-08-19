import { useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import LegacyCmrApp from "./App";
import TripApp from "./TripApp";

type Mode = "trip" | "cmr" | null;

export default function RootApp() {
  const [mode, setMode] = useState<Mode>(null);

  if (mode === "trip") return <SafeAreaProvider><TripApp onExit={() => setMode(null)} /></SafeAreaProvider>;
  if (mode === "cmr") return <LegacyCmrApp />;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.page}>
          <Text style={styles.eyebrow}>FORNEXA MOBILE</Text>
          <Text style={styles.title}>¿Qué vas a ejecutar?</Text>
          <Text style={styles.description}>
            Usa Viaje asignado cuando el trabajo incluya una ruta operativa completa. El acceso por CMR individual sigue disponible para trabajos unitarios y compatibilidad.
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => setMode("trip")}>
            <Text style={styles.primaryTitle}>Viaje asignado</Text>
            <Text style={styles.primaryText}>Todos los expedientes, CMR y paradas del viaje.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => setMode("cmr")}>
            <Text style={styles.secondaryTitle}>CMR individual</Text>
            <Text style={styles.secondaryText}>Escanea o introduce una CMR Key como hasta ahora.</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f8fb" },
  page: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  eyebrow: { color: "#174a6e", fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#102a3c", fontSize: 34, lineHeight: 40, fontWeight: "800" },
  description: { color: "#6a7d8f", fontSize: 15, lineHeight: 22, marginBottom: 10 },
  primary: { backgroundColor: "#174a6e", borderRadius: 16, padding: 20, gap: 5 },
  primaryTitle: { color: "white", fontSize: 20, fontWeight: "800" },
  primaryText: { color: "#dceaf3", fontSize: 14, lineHeight: 20 },
  secondary: { backgroundColor: "white", borderWidth: 1, borderColor: "#dce5ec", borderRadius: 16, padding: 20, gap: 5 },
  secondaryTitle: { color: "#174a6e", fontSize: 20, fontWeight: "800" },
  secondaryText: { color: "#6a7d8f", fontSize: 14, lineHeight: 20 },
});
