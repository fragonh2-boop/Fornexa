import { useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SignatureScreen, { type SignatureViewRef } from "react-native-signature-canvas";

const INCIDENT_OPTIONS = ["Falta mercancía", "Sobra mercancía", "Rotura", "Mojado", "Otros"] as const;

type StopSummary = {
  company: string;
  stop_type: string;
  expeditionCode: string;
  cmrNumber: string;
};

type Props = {
  mode: "incident" | "signature";
  stop: StopSummary;
  onClose: () => void;
  onIncident: (payload: { category: string; note: string }) => void;
  onSignature: () => void;
};

export default function TripStopAction({ mode, stop, onClose, onIncident, onSignature }: Props) {
  const [incidentType, setIncidentType] = useState<(typeof INCIDENT_OPTIONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const signatureRef = useRef<SignatureViewRef | null>(null);

  if (mode === "signature") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Back onPress={onClose} />
          <Text style={styles.eyebrow}>POD DIGITAL · {stop.expeditionCode}</Text>
          <Text style={styles.title}>Firma del destinatario</Text>
          <Text style={styles.muted}>{stop.company} · CMR {stop.cmrNumber}</Text>
        </View>
        <View style={styles.canvas}>
          <SignatureScreen
            ref={signatureRef}
            onOK={() => onSignature()}
            onEmpty={() => Alert.alert("Firma vacía", "Introduce una firma antes de confirmar.")}
            descriptionText=""
            clearText=""
            confirmText=""
            autoClear
            webStyle={signatureWebStyle}
          />
        </View>
        <View style={styles.bottom}>
          <Text style={styles.hint}>Firma dentro del recuadro y confirma cuando esté completa.</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondary} onPress={() => signatureRef.current?.clearSignature()}>
              <Text style={styles.secondaryText}>Borrar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primary} onPress={() => signatureRef.current?.readSignature()}>
              <Text style={styles.primaryText}>Aceptar firma</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const valid = Boolean(incidentType && (incidentType !== "Otros" || note.trim()));
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Back onPress={onClose} />
        <Text style={styles.eyebrow}>INCIDENCIA · {stop.expeditionCode}</Text>
        <Text style={styles.title}>¿Qué ha ocurrido?</Text>
        <Text style={styles.muted}>{stop.company} · {stop.stop_type} · CMR {stop.cmrNumber}</Text>
        <View style={styles.options}>
          {INCIDENT_OPTIONS.map((option) => (
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ checked: incidentType === option }}
              key={option}
              style={[styles.option, incidentType === option && styles.optionSelected]}
              onPress={() => {
                setIncidentType(option);
                if (option !== "Otros") setNote("");
              }}
            >
              <Text style={[styles.optionText, incidentType === option && styles.optionTextSelected]}>{option}</Text>
              <Text style={styles.check}>{incidentType === option ? "●" : "○"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {incidentType === "Otros" && (
          <View style={styles.field}>
            <Text style={styles.label}>Descripción</Text>
            <TextInput value={note} onChangeText={setNote} maxLength={50} placeholder="Máximo 50 caracteres" style={styles.input} />
            <Text style={styles.counter}>{note.length}/50</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.primary, !valid && styles.disabled]}
          onPress={() => valid && incidentType && onIncident({ category: incidentType, note: incidentType === "Otros" ? note.trim() : "" })}
        >
          <Text style={styles.primaryText}>Registrar incidencia</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryWide} onPress={onClose}><Text style={styles.secondaryText}>Cancelar</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return <TouchableOpacity onPress={onPress}><Text style={styles.back}>‹ Volver al viaje</Text></TouchableOpacity>;
}

const signatureWebStyle = `.m-signature-pad{box-shadow:none;border:0}.m-signature-pad--body{border:0}.m-signature-pad--footer{display:none;margin:0}`;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f8fb" },
  header: { padding: 20, gap: 6 },
  page: { padding: 20, gap: 16 },
  back: { color: "#174a6e", fontWeight: "800", fontSize: 15, marginBottom: 6 },
  eyebrow: { color: "#174a6e", fontSize: 12, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: "#102a3c", fontSize: 30, fontWeight: "800" },
  muted: { color: "#6a7d8f", fontSize: 14, lineHeight: 20 },
  canvas: { flex: 1, marginHorizontal: 20, borderWidth: 1, borderColor: "#dce5ec", borderRadius: 14, overflow: "hidden", backgroundColor: "white" },
  bottom: { padding: 20, gap: 12 },
  hint: { color: "#6a7d8f", fontSize: 13 },
  actions: { flexDirection: "row", gap: 10 },
  primary: { flex: 1, minHeight: 48, borderRadius: 10, backgroundColor: "#174a6e", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  primaryText: { color: "white", fontWeight: "800" },
  secondary: { flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: "#b9c9d5", backgroundColor: "white", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  secondaryWide: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: "#b9c9d5", backgroundColor: "white", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  secondaryText: { color: "#174a6e", fontWeight: "800" },
  options: { gap: 9 },
  option: { minHeight: 50, borderRadius: 11, borderWidth: 1, borderColor: "#dce5ec", backgroundColor: "white", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionSelected: { borderColor: "#174a6e", backgroundColor: "#e9f1f6" },
  optionText: { color: "#40566a", fontSize: 15, fontWeight: "700" },
  optionTextSelected: { color: "#174a6e" },
  check: { color: "#174a6e", fontSize: 18 },
  field: { gap: 6 },
  label: { color: "#40566a", fontSize: 12, fontWeight: "800" },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: "#dce5ec", backgroundColor: "white", paddingHorizontal: 12, color: "#102a3c" },
  counter: { color: "#6a7d8f", fontSize: 11, textAlign: "right" },
  disabled: { opacity: 0.45 },
});
