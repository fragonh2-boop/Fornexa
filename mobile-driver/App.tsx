import { useMemo, useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import SignatureScreen from "react-native-signature-canvas";

const SAMPLE_KEY = "F9K7-2M4X-PQ8R";

type Screen = "home" | "scanner" | "transport" | "signature";

type Stop = {
  id: string;
  type: "Recogida" | "Entrega";
  company: string;
  address: string;
  window: string;
  status: string;
};

const stops: Stop[] = [
  {
    id: "ST-001",
    type: "Recogida",
    company: "Mediterránea Retail, S.L.",
    address: "Av. del Puerto, 120 · Valencia",
    window: "05/08/2026 · 09:00",
    status: "Pendiente",
  },
  {
    id: "ST-002",
    type: "Entrega",
    company: "Rhône Distribution SAS",
    address: "12 Rue de l'Industrie · Lyon",
    window: "06/08/2026 · 14:00",
    status: "Pendiente",
  },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [key, setKey] = useState("");
  const [imported, setImported] = useState(false);
  const [signed, setSigned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const normalizedKey = useMemo(() => key.trim().toUpperCase(), [key]);

  function importCmr(value = normalizedKey) {
    if (value !== SAMPLE_KEY) {
      Alert.alert("Código no válido", `Para esta beta utiliza ${SAMPLE_KEY}.`);
      return;
    }
    setKey(value);
    setImported(true);
    setScreen("transport");
  }

  if (screen === "scanner") {
    if (!permission?.granted) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.title}>Permiso de cámara</Text>
            <Text style={styles.muted}>Necesitamos la cámara para leer el QR del CMR.</Text>
            <PrimaryButton label="Permitir cámara" onPress={requestPermission} />
            <SecondaryButton label="Volver" onPress={() => setScreen("home")} />
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            const qrKey = data.includes("/") ? data.split("/").pop() ?? "" : data;
            importCmr(qrKey.toUpperCase());
          }}
        />
        <View style={styles.scannerOverlay}>
          <Text style={styles.scannerTitle}>Escanea el QR del CMR</Text>
          <View style={styles.scanFrame} />
          <SecondaryButton label="Cancelar" onPress={() => setScreen("home")} />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "signature") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.signatureHeader}>
          <Text style={styles.eyebrow}>ENTREGA</Text>
          <Text style={styles.title}>Firma del destinatario</Text>
          <Text style={styles.muted}>Firma dentro del recuadro y confirma.</Text>
        </View>
        <View style={styles.signatureCanvas}>
          <SignatureScreen
            onOK={() => {
              setSigned(true);
              setScreen("transport");
              Alert.alert("Firma guardada", "La firma queda asociada al CMR y pendiente de sincronización.");
            }}
            onEmpty={() => Alert.alert("Firma vacía", "Introduce una firma antes de confirmar.")}
            descriptionText="Firma aquí"
            clearText="Borrar"
            confirmText="Confirmar"
            webStyle=".m-signature-pad--footer {display:flex; gap:8px;} .m-signature-pad--body {border:none;}"
          />
        </View>
        <View style={styles.bottomAction}>
          <SecondaryButton label="Cancelar" onPress={() => setScreen("transport")} />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "transport" && imported) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.topbar}>
            <TouchableOpacity onPress={() => setScreen("home")}><Text style={styles.back}>← Inicio</Text></TouchableOpacity>
            <Text style={styles.sync}>● Pendiente de sincronizar</Text>
          </View>

          <Text style={styles.eyebrow}>CMR IMPORTADO</Text>
          <Text style={styles.title}>CMR-260128</Text>
          <Text style={styles.route}>Valencia → Lyon</Text>

          <View style={styles.summaryCard}>
            <Summary label="Expedición" value="EX-260071" />
            <Summary label="Viaje" value="VJ-260041" />
            <Summary label="Mercancía" value="10 palets EUR" />
            <Summary label="Peso" value="5.840 kg" />
          </View>

          <Text style={styles.sectionTitle}>Paradas</Text>
          {stops.map((stop, index) => (
            <View key={stop.id} style={styles.stopCard}>
              <View style={styles.stopIndex}><Text style={styles.stopIndexText}>{index + 1}</Text></View>
              <View style={styles.stopBody}>
                <Text style={styles.stopType}>{stop.type}</Text>
                <Text style={styles.stopCompany}>{stop.company}</Text>
                <Text style={styles.stopMeta}>{stop.address}</Text>
                <Text style={styles.stopMeta}>{stop.window}</Text>
              </View>
              <Text style={styles.pending}>{stop.status}</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Acciones</Text>
          <View style={styles.actionGrid}>
            <Action label="He llegado" sublabel="Registrar GPS y hora" onPress={() => Alert.alert("Llegada registrada", "Evento guardado localmente.")} />
            <Action label="Añadir fotos" sublabel="Carga, entrega o daño" onPress={() => Alert.alert("Fotos", "La captura y asociación de fotos será el siguiente bloque.")} />
            <Action label={signed ? "Firmado" : "Firmar"} sublabel={signed ? "Firma guardada" : "Destinatario o expedidor"} onPress={() => setScreen("signature")} />
            <Action label="Incidencia" sublabel="Daños, faltas o espera" onPress={() => Alert.alert("Incidencia", "Formulario simplificado en la siguiente iteración.")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.home} keyboardShouldPersistTaps="handled">
        <View style={styles.logoMark}><Text style={styles.logoMarkText}>4NXA</Text></View>
        <Text style={styles.brand}>FORNEXA DRIVER</Text>
        <Text style={styles.hero}>Tu transporte, sin papeles.</Text>
        <Text style={styles.muted}>Importa el CMR y gestiona recogidas, entregas, fotos y firmas.</Text>

        <PrimaryButton label="Escanear QR" onPress={() => setScreen("scanner")} />

        <View style={styles.divider}><View /><Text>o introduce el código</Text><View /></View>

        <TextInput
          value={key}
          onChangeText={setKey}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="F9K7-2M4X-PQ8R"
          placeholderTextColor="#617085"
          style={styles.input}
          returnKeyType="go"
          onSubmitEditing={() => importCmr()}
        />
        <SecondaryButton label="Importar CMR" onPress={() => importCmr()} />

        <TouchableOpacity style={styles.demo} onPress={() => { setKey(SAMPLE_KEY); importCmr(SAMPLE_KEY); }}>
          <Text style={styles.demoTitle}>Abrir transporte de demostración</Text>
          <Text style={styles.demoText}>{SAMPLE_KEY}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.primaryButton} onPress={onPress}><Text style={styles.primaryButtonText}>{label}</Text></TouchableOpacity>;
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.secondaryButton} onPress={onPress}><Text style={styles.secondaryButtonText}>{label}</Text></TouchableOpacity>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

function Action({ label, sublabel, onPress }: { label: string; sublabel: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.actionCard} onPress={onPress}><Text style={styles.actionLabel}>{label}</Text><Text style={styles.actionSublabel}>{sublabel}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#07111f" },
  home: { flexGrow: 1, padding: 28, justifyContent: "center" },
  scroll: { padding: 22, paddingBottom: 44 },
  centered: { flex: 1, justifyContent: "center", padding: 28, gap: 16 },
  logoMark: { width: 70, height: 70, borderRadius: 20, backgroundColor: "#67e5b2", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  logoMarkText: { color: "#07111f", fontWeight: "900", fontSize: 18 },
  brand: { color: "#67e5b2", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  hero: { color: "white", fontSize: 34, lineHeight: 39, fontWeight: "900", marginTop: 12, marginBottom: 10 },
  title: { color: "white", fontSize: 30, fontWeight: "900", marginTop: 4 },
  route: { color: "#c5d1de", fontSize: 18, marginTop: 5, marginBottom: 20 },
  muted: { color: "#91a0b3", fontSize: 15, lineHeight: 22, marginBottom: 24 },
  eyebrow: { color: "#67e5b2", fontSize: 11, fontWeight: "900", letterSpacing: 1.8 },
  primaryButton: { backgroundColor: "#67e5b2", borderRadius: 16, minHeight: 58, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryButtonText: { color: "#07111f", fontWeight: "900", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#26364c", backgroundColor: "#0d1b2d", borderRadius: 16, minHeight: 56, alignItems: "center", justifyContent: "center", marginTop: 12 },
  secondaryButtonText: { color: "white", fontWeight: "800", fontSize: 15 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 22 },
  dividerText: { color: "#91a0b3" },
  input: { backgroundColor: "#0c192a", borderWidth: 1, borderColor: "#26364c", borderRadius: 16, minHeight: 58, paddingHorizontal: 18, color: "white", textAlign: "center", fontSize: 18, fontWeight: "800", letterSpacing: 1.4 },
  demo: { marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: "#0a1726" },
  demoTitle: { color: "#c8d3df", fontWeight: "800" },
  demoText: { color: "#67e5b2", marginTop: 5, fontWeight: "900", letterSpacing: 1 },
  scannerOverlay: { flex: 1, padding: 26, alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(7,17,31,.28)" },
  scannerTitle: { color: "white", fontSize: 20, fontWeight: "900", marginTop: 34 },
  scanFrame: { width: 260, height: 260, borderWidth: 3, borderColor: "#67e5b2", borderRadius: 28 },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  back: { color: "#67e5b2", fontWeight: "800" },
  sync: { color: "#f2bd65", fontSize: 11, fontWeight: "800" },
  summaryCard: { flexDirection: "row", flexWrap: "wrap", backgroundColor: "#0d1b2d", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#1d2c40" },
  summaryItem: { width: "50%", marginVertical: 8 },
  summaryLabel: { color: "#76879b", fontSize: 11, textTransform: "uppercase", fontWeight: "800" },
  summaryValue: { color: "white", fontWeight: "800", marginTop: 4 },
  sectionTitle: { color: "white", fontSize: 18, fontWeight: "900", marginTop: 28, marginBottom: 12 },
  stopCard: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 17, backgroundColor: "#0d1b2d", marginBottom: 10, borderWidth: 1, borderColor: "#1d2c40" },
  stopIndex: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#16283d", alignItems: "center", justifyContent: "center", marginRight: 12 },
  stopIndexText: { color: "#67e5b2", fontWeight: "900" },
  stopBody: { flex: 1 },
  stopType: { color: "#67e5b2", fontSize: 11, textTransform: "uppercase", fontWeight: "900" },
  stopCompany: { color: "white", fontWeight: "900", marginTop: 3 },
  stopMeta: { color: "#8fa0b4", fontSize: 12, marginTop: 3 },
  pending: { color: "#f2bd65", fontSize: 10, fontWeight: "900" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: { width: "48%", minHeight: 110, borderRadius: 17, padding: 16, backgroundColor: "#0d1b2d", borderWidth: 1, borderColor: "#1d2c40", justifyContent: "flex-end" },
  actionLabel: { color: "white", fontSize: 16, fontWeight: "900" },
  actionSublabel: { color: "#8495a9", fontSize: 11, marginTop: 5 },
  signatureHeader: { padding: 22, paddingBottom: 14 },
  signatureCanvas: { flex: 1, marginHorizontal: 18, borderRadius: 18, overflow: "hidden", backgroundColor: "white" },
  bottomAction: { padding: 18 },
});
