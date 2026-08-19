import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";

import TripStopAction from "./TripStopAction";

const API_URL = process.env.EXPO_PUBLIC_FORNEXA_API_URL ?? "https://fornexasc.com";

type TripStop = {
  id: string;
  sequence: number;
  stop_type: string;
  company: string;
  address: string;
  window_start?: string;
  window_end?: string;
  contact_name?: string;
  contact_phone?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  arrived_at?: string;
  completed_at?: string;
  evidenceCount: number;
  contactMissing: boolean;
  reference?: string;
  expeditionCode: string;
  expeditionSequence: number;
  cmrNumber: string;
};

type TripPayload = {
  trip: {
    id: string;
    code: string;
    status: string;
    planned_start?: string;
    actual_start?: string;
    planned_end?: string;
    actual_end?: string;
    trailer_registration?: string;
    vehicle?: { registration?: string; vehicle_type?: string } | null;
    driver?: { name?: string; phone?: string } | null;
  };
  expeditions: Array<{
    id: string;
    code: string;
    sequence: number;
    status: string;
    cmrs: Array<{
      id: string;
      cmr_number: string;
      status: string;
      sender: string;
      recipient: string;
      pickup_location: string;
      delivery_location: string;
      goods_description: string;
      packages?: number;
      gross_weight?: number;
      stops: Omit<TripStop, "expeditionCode" | "expeditionSequence" | "cmrNumber">[];
    }>;
  }>;
  capability: { expiresAt: string; driverId?: string | null };
};

type EventType = "arrival" | "complete" | "incident" | "signature";
type StopAction = "incident" | "signature" | null;

type TripAppProps = {
  onExit: () => void;
  initialToken?: string;
};

export default function TripApp({ onExit, initialToken = "" }: TripAppProps) {
  const [token, setToken] = useState(initialToken);
  const [trip, setTrip] = useState<TripPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [selectedStop, setSelectedStop] = useState<TripStop | null>(null);
  const [stopAction, setStopAction] = useState<StopAction>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const consumedInitialToken = useRef("");

  const normalizedToken = normalizeToken(token);

  const stops = useMemo<TripStop[]>(() => {
    if (!trip) return [];
    return trip.expeditions
      .flatMap((expedition) =>
        expedition.cmrs.flatMap((cmr) =>
          (cmr.stops ?? []).map((stop) => ({
            ...stop,
            expeditionCode: expedition.code,
            expeditionSequence: expedition.sequence,
            cmrNumber: cmr.cmr_number,
          })),
        ),
      )
      .sort((a, b) => a.expeditionSequence - b.expeditionSequence || a.sequence - b.sequence);
  }, [trip]);

  const pending = stops.filter((stop) => stop.status !== "Completada");
  const completed = stops.filter((stop) => stop.status === "Completada");

  const loadTrip = useCallback(async (value = normalizedToken, quiet = false) => {
    const accessToken = normalizeToken(value);
    if (!accessToken) {
      if (!quiet) Alert.alert("Viaje", "Introduce o escanea un acceso de Viaje válido.");
      return;
    }
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/mobile/trips/current`, {
        headers: { Accept: "application/json", "x-fornexa-trip-token": accessToken },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el viaje.");
      setToken(accessToken);
      setTrip(body as TripPayload);
      setScanner(false);
    } catch (error) {
      if (!quiet) Alert.alert("Viaje no disponible", messageFor(error));
    } finally {
      if (!quiet) setLoading(false);
      setRefreshing(false);
    }
  }, [normalizedToken]);

  useEffect(() => {
    const incoming = normalizeToken(initialToken);
    if (!incoming || consumedInitialToken.current === incoming) return;
    consumedInitialToken.current = incoming;
    setToken(incoming);
    void loadTrip(incoming);
  }, [initialToken, loadTrip]);

  useEffect(() => {
    if (!trip || stopAction || trip.trip.status === "COMPLETED") return;
    const timer = setInterval(() => loadTrip(token, true), 15000);
    return () => clearInterval(timer);
  }, [loadTrip, token, trip, stopAction]);

  async function postEvent(
    stop: TripStop,
    type: EventType,
    payload: Record<string, unknown> = {},
  ) {
    try {
      setLoading(true);
      let location: Location.LocationObject | null = null;
      if (type === "arrival") {
        const granted = await Location.requestForegroundPermissionsAsync();
        if (granted.status === "granted") {
          location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
      }
      const response = await fetch(`${API_URL}/api/mobile/stops/${stop.id}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fornexa-trip-token": token,
          "x-idempotency-key": `${stop.id}-${type}-${Date.now()}`,
        },
        body: JSON.stringify({
          type,
          occurredAt: new Date().toISOString(),
          latitude: location?.coords.latitude,
          longitude: location?.coords.longitude,
          payload,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo registrar la operación.");
      setStopAction(null);
      setSelectedStop(null);
      await loadTrip(token, true);
      const confirmation = type === "arrival"
        ? "Llegada registrada."
        : type === "complete"
          ? "Parada completada."
          : type === "incident"
            ? "Incidencia registrada."
            : "Firma registrada.";
      Alert.alert("Sincronizado", confirmation);
    } catch (error) {
      Alert.alert("No se pudo sincronizar", messageFor(error));
    } finally {
      setLoading(false);
    }
  }

  async function addPhoto(stop: TripStop) {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraPermission.granted) {
      Alert.alert("Permiso de cámara", "Autoriza la cámara para adjuntar el POD.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.72, exif: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const data = new FormData();
    data.append("stopId", stop.id);
    data.append("photo", {
      uri: asset.uri,
      name: asset.fileName ?? `pod-${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/mobile/evidence`, {
        method: "POST",
        headers: {
          "x-fornexa-trip-token": token,
          "x-idempotency-key": `${stop.id}-photo-${Date.now()}`,
        },
        body: data,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el POD.");
      await loadTrip(token, true);
      Alert.alert("POD sincronizado", "La fotografía ya forma parte del histórico del transporte.");
    } catch (error) {
      Alert.alert("POD pendiente", messageFor(error));
    } finally {
      setLoading(false);
    }
  }

  async function openRoute() {
    if (!stops.length) return;
    try {
      setLoading(true);
      const points = await Promise.all(stops.map(async (stop) => {
        const lat = Number(stop.latitude);
        const lng = Number(stop.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          return `${lat.toFixed(6)},${lng.toFixed(6)}`;
        }
        const permissionResult = await Location.requestForegroundPermissionsAsync();
        if (permissionResult.status !== "granted") throw new Error("Autoriza la ubicación para proyectar la ruta.");
        const results = await Location.geocodeAsync(stop.address);
        const point = results[0];
        if (!point) throw new Error(`No se pudo localizar ${stop.company}.`);
        return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
      }));
      const origin = points[0];
      const destination = points.at(-1);
      if (!origin || !destination) return;
      const waypoints = points.slice(1, -1).join("|");
      await Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`);
    } catch (error) {
      Alert.alert("Ruta no disponible", messageFor(error));
    } finally {
      setLoading(false);
    }
  }

  async function finishTrip() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/mobile/trips/current/finish`, {
        method: "POST",
        headers: {
          "x-fornexa-trip-token": token,
          "x-idempotency-key": `finish-trip-${Date.now()}`,
        },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo finalizar el viaje.");
      const completedAt = typeof body.completedAt === "string" ? body.completedAt : new Date().toISOString();
      setTrip((current) => current ? {
        ...current,
        trip: { ...current.trip, status: "COMPLETED", actual_end: completedAt },
      } : current);
      Alert.alert("Viaje finalizado", "El viaje queda cerrado en FORNEXA y el acceso Mobile ha sido revocado.");
    } catch (error) {
      Alert.alert("No se pudo finalizar", messageFor(error));
    } finally {
      setLoading(false);
    }
  }

  if (selectedStop && stopAction) {
    return (
      <TripStopAction
        mode={stopAction}
        stop={selectedStop}
        onClose={() => { setStopAction(null); setSelectedStop(null); }}
        onIncident={(payload) => void postEvent(selectedStop, "incident", payload)}
        onSignature={() => void postEvent(selectedStop, "signature", { captured: true })}
      />
    );
  }

  if (scanner) {
    if (!permission?.granted) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={styles.title}>Acceso a cámara</Text>
            <Text style={styles.muted}>Necesitamos la cámara para leer el QR del Viaje.</Text>
            <Button label="Permitir cámara" onPress={requestPermission} />
            <Button label="Volver" tone="secondary" onPress={() => setScanner(false)} />
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => loadTrip(data)}
        />
        <View style={styles.scannerOverlay}>
          <Text style={styles.scannerTitle}>Escanea el QR del Viaje</Text>
          <View style={styles.scanFrame} />
          <Button label="Cancelar" tone="secondary" onPress={() => setScanner(false)} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.home}>
          <TouchableOpacity onPress={onExit}><Text style={styles.back}>‹ Volver</Text></TouchableOpacity>
          <Text style={styles.eyebrow}>VIAJE ASIGNADO</Text>
          <Text style={styles.title}>Importa tu viaje</Text>
          <Text style={styles.muted}>Un único acceso carga todos los expedientes, CMR y paradas que forman parte del viaje.</Text>
          <Button label="Escanear QR de Viaje" onPress={() => setScanner(true)} />
          <TextInput
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Token de viaje"
            style={styles.input}
            onSubmitEditing={() => loadTrip()}
          />
          <Button label={loading ? "Importando…" : "Importar viaje"} tone="secondary" onPress={() => loadTrip()} />
          {loading && <ActivityIndicator />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={trip.trip.status === "COMPLETED" ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTrip(token, true); }} />}
      >
        <View style={styles.top}>
          <TouchableOpacity onPress={() => setTrip(null)}><Text style={styles.back}>‹ Cambiar viaje</Text></TouchableOpacity>
          <Text style={styles.sync}>{trip.trip.status === "COMPLETED" ? "✓ Finalizado" : "● Sincronizado"}</Text>
        </View>
        <Text style={styles.eyebrow}>VIAJE · {trip.trip.status}</Text>
        <Text style={styles.title}>{trip.trip.code}</Text>
        <Text style={styles.muted}>
          {trip.trip.vehicle?.registration || "Sin vehículo"} · {trip.trip.driver?.name || "Sin conductor"}
          {trip.trip.trailer_registration ? ` · Remolque ${trip.trip.trailer_registration}` : ""}
        </Text>
        <View style={styles.summary}>
          <Summary label="Expediciones" value={String(trip.expeditions.length)} />
          <Summary label="Paradas pendientes" value={String(pending.length)} />
          <Summary label="Finalizadas" value={String(completed.length)} />
        </View>
        <Button label="Proyectar ruta completa" onPress={openRoute} />
        {pending.length === 0 && completed.length > 0 && trip.trip.status !== "COMPLETED" && (
          <Button
            label="Finalizar viaje"
            onPress={() => Alert.alert("Finalizar viaje", "Todas las paradas están completadas. ¿Cerrar el viaje?", [
              { text: "Cancelar" },
              { text: "Finalizar", onPress: finishTrip },
            ])}
          />
        )}
        <Text style={styles.section}>Paradas</Text>
        {stops.map((stop, index) => (
          <View key={stop.id} style={[styles.card, stop.status === "Completada" && styles.cardDone]}>
            <View style={styles.cardTop}>
              <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
              <View style={styles.cardBody}>
                <Text style={styles.stopType}>{stop.stop_type} · {stop.expeditionCode}</Text>
                <Text style={styles.company}>{stop.company}</Text>
                <Text style={styles.meta}>{stop.address}</Text>
                <Text style={styles.meta}>CMR {stop.cmrNumber} · POD {stop.evidenceCount}</Text>
                {stop.contact_phone ? (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${stop.contact_phone}`)}>
                    <Text style={styles.phone}>{stop.contact_phone}</Text>
                  </TouchableOpacity>
                ) : <Text style={styles.warning}>Sin teléfono de contacto</Text>}
              </View>
              <Text style={styles.status}>{stop.status}</Text>
            </View>
            {stop.status !== "Completada" && trip.trip.status !== "COMPLETED" && (
              <View style={styles.actions}>
                <Small label={stop.arrived_at ? "Llegada ✓" : "He llegado"} onPress={() => postEvent(stop, "arrival")} />
                <Small label={`Foto POD (${stop.evidenceCount})`} onPress={() => addPhoto(stop)} />
                <Small label="Firma" onPress={() => { setSelectedStop(stop); setStopAction("signature"); }} />
                <Small label="Incidencia" onPress={() => { setSelectedStop(stop); setStopAction("incident"); }} />
                <Small label="Completar" onPress={() => postEvent(stop, "complete")} />
              </View>
            )}
          </View>
        ))}
        {loading && <View style={styles.loading}><ActivityIndicator /><Text>Sincronizando…</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

function normalizeToken(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  } catch {
    return raw.split("?")[0]?.replace(/\/$/, "").split("/").at(-1) ?? raw;
  }
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Comprueba la conexión.";
}

function Button({ label, onPress, tone = "primary" }: { label: string; onPress: () => void; tone?: "primary" | "secondary" }) {
  return (
    <TouchableOpacity style={tone === "primary" ? styles.button : styles.buttonSecondary} onPress={onPress}>
      <Text style={tone === "primary" ? styles.buttonText : styles.buttonSecondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Small({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.small} onPress={onPress}><Text style={styles.smallText}>{label}</Text></TouchableOpacity>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f8fb" },
  home: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 16 },
  page: { padding: 18, paddingBottom: 48, gap: 14 },
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { color: "#174a6e", fontWeight: "700", fontSize: 15 },
  sync: { color: "#3f705e", fontSize: 12, fontWeight: "700" },
  eyebrow: { color: "#174a6e", fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#102a3c", fontSize: 32, fontWeight: "800" },
  muted: { color: "#6a7d8f", fontSize: 15, lineHeight: 22 },
  input: { minHeight: 50, borderWidth: 1, borderColor: "#dce5ec", borderRadius: 12, backgroundColor: "white", paddingHorizontal: 14, color: "#102a3c" },
  button: { minHeight: 50, borderRadius: 12, backgroundColor: "#174a6e", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { color: "white", fontWeight: "800" },
  buttonSecondary: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: "#b9c9d5", backgroundColor: "white", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonSecondaryText: { color: "#174a6e", fontWeight: "800" },
  summary: { flexDirection: "row", gap: 8 },
  summaryItem: { flex: 1, backgroundColor: "white", borderWidth: 1, borderColor: "#dce5ec", borderRadius: 12, padding: 12 },
  summaryLabel: { color: "#6a7d8f", fontSize: 11 },
  summaryValue: { color: "#102a3c", fontSize: 21, fontWeight: "800", marginTop: 4 },
  section: { marginTop: 8, color: "#102a3c", fontSize: 19, fontWeight: "800" },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#dce5ec", borderRadius: 14, padding: 14, gap: 12 },
  cardDone: { opacity: 0.68 },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  number: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#e9f1f6", alignItems: "center", justifyContent: "center" },
  numberText: { color: "#174a6e", fontWeight: "800" },
  cardBody: { flex: 1, gap: 4 },
  stopType: { color: "#174a6e", fontSize: 11, fontWeight: "800" },
  company: { color: "#102a3c", fontSize: 17, fontWeight: "800" },
  meta: { color: "#6a7d8f", fontSize: 13, lineHeight: 18 },
  phone: { color: "#174a6e", fontSize: 13, fontWeight: "700" },
  warning: { color: "#a24f5a", fontSize: 12, fontWeight: "700" },
  status: { color: "#40566a", fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  small: { borderRadius: 9, borderWidth: 1, borderColor: "#b9c9d5", paddingVertical: 9, paddingHorizontal: 11, backgroundColor: "#fff" },
  smallText: { color: "#174a6e", fontSize: 12, fontWeight: "800" },
  loading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 },
  scannerOverlay: { flex: 1, alignItems: "center", justifyContent: "space-around", padding: 24, backgroundColor: "rgba(0,0,0,.35)" },
  scannerTitle: { color: "white", fontSize: 24, fontWeight: "800" },
  scanFrame: { width: 250, height: 250, borderWidth: 3, borderColor: "white", borderRadius: 18 },
});
