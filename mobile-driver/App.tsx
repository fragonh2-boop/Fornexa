import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import SignatureScreen, {
  type SignatureViewRef,
} from "react-native-signature-canvas";

const API_URL =
  process.env.EXPO_PUBLIC_FORNEXA_API_URL ?? "https://fornexasc.com";
const INCIDENT_OPTIONS = [
  "Falta mercancía",
  "Sobra mercancía",
  "Rotura",
  "Mojado",
  "Otros",
] as const;
const COLORS = {
  canvas: "#f5f8fb",
  surface: "#ffffff",
  primary: "#174a6e",
  primaryPressed: "#103b59",
  primarySoft: "#e9f1f6",
  ink: "#102a3c",
  inkSoft: "#40566a",
  muted: "#6a7d8f",
  border: "#dce5ec",
  success: "#3f705e",
  successSoft: "#edf5f1",
  warning: "#876928",
  danger: "#a24f5a",
  dangerSoft: "#fbf0f2",
} as const;

type Screen =
  | "home"
  | "scanner"
  | "transport"
  | "history"
  | "signature"
  | "incident"
  | "stopDetail";
type EventType = "arrival" | "complete" | "incident" | "signature";
type CmrDocument = {
  id: string;
  cmr_number: string;
  status: string;
  expedition_id?: string;
  trip_id?: string;
  sender: string;
  recipient: string;
  pickup_location: string;
  delivery_location: string;
  goods_description: string;
  packages?: number;
  gross_weight?: number;
};
type StopOrder = {
  id: string;
  customerId?: string;
  description?: string;
  packages?: number;
  weight?: number;
};
type Stop = {
  id: string;
  sequence: number;
  stop_type: "Recogida" | "Entrega";
  company: string;
  address: string;
  window_start?: string;
  window_end?: string;
  contact_name?: string;
  contact_phone?: string;
  reference?: string;
  orders?: StopOrder[];
  contactMissing: boolean;
  latitude?: number;
  longitude?: number;
  status: string;
  arrived_at?: string;
  completed_at?: string;
  evidenceCount: number;
};
type TransportEvent = {
  id: string;
  stop_id?: string;
  event_type: string;
  occurred_at: string;
  payload?: Record<string, unknown>;
};
type TransportPayload = {
  document: CmrDocument;
  stops: Stop[];
  events: TransportEvent[];
  sync: { serverTime: string; pollAfterSeconds: number };
};

export default function App() {
  return (
    <SafeAreaProvider>
      <FornexaApp />
    </SafeAreaProvider>
  );
}

function FornexaApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [key, setKey] = useState("");
  const [transport, setTransport] = useState<TransportPayload | null>(null);
  const [completedStops, setCompletedStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<"transport" | "history">(
    "transport",
  );
  const [incidentType, setIncidentType] = useState<
    (typeof INCIDENT_OPTIONS)[number] | null
  >(null);
  const [incidentNote, setIncidentNote] = useState("");
  const signatureRef = useRef<SignatureViewRef | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const normalizedKey = normalizeKey(key);

  const loadTransport = useCallback(
    async (value = normalizedKey, quiet = false) => {
      const accessKey = normalizeKey(value);
      if (!accessKey) {
        if (!quiet)
          Alert.alert("CMR Key", "Introduce o escanea una CMR Key válida.");
        return;
      }
      if (!quiet) setLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/api/mobile/cmr/${encodeURIComponent(accessKey)}`,
          { headers: { Accept: "application/json" } },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "No se pudo importar el transporte.");
        const stops = Array.isArray(result.stops)
          ? (result.stops as Stop[])
          : [];
        setCompletedStops(stops.filter((stop) => stop.status === "Completada"));
        setKey(accessKey);
        setTransport({
          ...result,
          stops: stops.filter((stop) => stop.status !== "Completada"),
        });
        if (!quiet) setScreen("transport");
      } catch (error) {
        if (!quiet)
          Alert.alert(
            "No se pudo importar",
            messageFor(error, "Comprueba tu conexión."),
          );
      } finally {
        if (!quiet) setLoading(false);
        setRefreshing(false);
      }
    },
    [normalizedKey],
  );

  useEffect(() => {
    if (!transport || !["transport", "history"].includes(screen)) return;
    const timer = setInterval(() => loadTransport(key, true), 15000);
    return () => clearInterval(timer);
  }, [key, loadTransport, screen, transport]);

  async function postEvent(
    stop: Stop,
    type: EventType,
    payload: Record<string, unknown> = {},
    overwriteArrival = false,
  ) {
    try {
      setLoading(true);
      let location: Location.LocationObject | null = null;
      if (type === "arrival") {
        const permissionResult =
          await Location.requestForegroundPermissionsAsync();
        if (permissionResult.status === "granted")
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
      }
      const response = await fetch(
        `${API_URL}/api/mobile/stops/${stop.id}/events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-fornexa-key": key,
            "x-idempotency-key": `${stop.id}-${type}-${Date.now()}`,
          },
          body: JSON.stringify({
            type,
            occurredAt: new Date().toISOString(),
            latitude: location?.coords.latitude,
            longitude: location?.coords.longitude,
            payload,
            overwrite: overwriteArrival,
          }),
        },
      );
      const result = await response.json();
      if (response.status === 409 && type === "arrival") {
        confirmArrivalOverwrite(stop, result.previousArrival);
        return;
      }
      if (!response.ok)
        throw new Error(result.error || "No se pudo registrar el evento.");
      await loadTransport(key, true);
      if (type === "complete" && result.allStopsCompleted) {
        Alert.alert(
          "Todas las paradas están completadas",
          "¿Deseas finalizar el trabajo y cerrar este transporte?",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Finalizar", onPress: finishWork },
          ],
        );
        return;
      }
      Alert.alert("Sincronizado", eventConfirmation(type, overwriteArrival));
    } catch (error) {
      Alert.alert("Pendiente", messageFor(error, "No se pudo sincronizar."));
    } finally {
      setLoading(false);
    }
  }

  function confirmArrivalOverwrite(
    stop: Stop,
    previousArrival = stop.arrived_at,
  ) {
    const previous = previousArrival
      ? new Date(previousArrival).toLocaleString("es-ES")
      : "una hora anterior";
    Alert.alert(
      "Llegada ya registrada",
      `Esta parada ya tenía una llegada marcada el ${previous}. ¿Deseas sustituir la hora operativa? El registro anterior se conservará en la auditoría.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sobrescribir",
          style: "destructive",
          onPress: () => postEvent(stop, "arrival", {}, true),
        },
      ],
    );
  }

  function markArrival(stop: Stop) {
    if (stop.arrived_at) {
      confirmArrivalOverwrite(stop);
      return;
    }
    postEvent(stop, "arrival");
  }

  async function finishWork() {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/mobile/cmr/${encodeURIComponent(key)}/finish`,
        {
          method: "POST",
          headers: {
            "x-fornexa-key": key,
            "x-idempotency-key": `finish-${key}-${Date.now()}`,
          },
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No se pudo finalizar el trabajo.");
      await loadTransport(key, true);
      Alert.alert(
        "Trabajo finalizado",
        "El transporte se ha cerrado y el evento queda registrado en el histórico.",
      );
    } catch (error) {
      Alert.alert(
        "No se pudo finalizar",
        messageFor(error, "Comprueba la conexión."),
      );
    } finally {
      setLoading(false);
    }
  }

  function startNewWork() {
    setTransport(null);
    setCompletedStops([]);
    setKey("");
    setSelectedStop(null);
    setIncidentType(null);
    setIncidentNote("");
    setScreen("home");
  }

  async function addPhoto(stop: Stop) {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraPermission.granted) {
      Alert.alert(
        "Permiso de cámara",
        "La fotografía es obligatoria para cerrar la parada.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.72,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
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
          "x-fornexa-key": key,
          "x-idempotency-key": `${stop.id}-photo-${Date.now()}`,
        },
        body: data,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "No se pudo guardar la foto.");
      await loadTransport(key, true);
      Alert.alert(
        "Foto sincronizada",
        "La evidencia POD ya forma parte del histórico.",
      );
    } catch (error) {
      Alert.alert(
        "Foto pendiente",
        messageFor(error, "No se pudo sincronizar."),
      );
    } finally {
      setLoading(false);
    }
  }

  async function openRoute() {
    if (!transport) return;
    const routeStops = [...completedStops, ...transport.stops];
    if (!routeStops.length) return;
    const ordered = routeStops.sort((a, b) => a.sequence - b.sequence);
    try {
      setLoading(true);
      if (ordered.some((stop) => !storedCoordinate(stop))) {
        const permissionResult =
          await Location.requestForegroundPermissionsAsync();
        if (permissionResult.status !== "granted")
          throw new Error(
            "Autoriza la ubicación para convertir las direcciones operativas en coordenadas.",
          );
      }
      const points = await Promise.all(
        ordered.map(async (stop) => {
          const stored = storedCoordinate(stop);
          if (stored) return stored;
          const address = navigationAddress(stop.address),
            results = await Location.geocodeAsync(address),
            point = results[0];
          if (!point)
            throw new Error(
              `No se pudo localizar ${stop.company} (${address}).`,
            );
          return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
        }),
      );
      const origin = points[0],
        destination = points.at(-1);
      if (!origin || !destination) return;
      const waypoints = points.slice(1, -1).join("|");
      const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        "Ruta no disponible",
        messageFor(
          error,
          "No se pudieron resolver las coordenadas de la ruta.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function openStop(stop: Stop, origin: "transport" | "history") {
    setSelectedStop(stop);
    setDetailOrigin(origin);
    setScreen("stopDetail");
  }

  function openIncident(stop: Stop) {
    setSelectedStop(stop);
    setIncidentType(null);
    setIncidentNote("");
    setScreen("incident");
  }

  function submitIncident() {
    if (!selectedStop || !incidentType) return;
    if (incidentType === "Otros" && !incidentNote.trim()) {
      Alert.alert(
        "Describe la incidencia",
        "Introduce un texto de hasta 50 caracteres.",
      );
      return;
    }
    setScreen("transport");
    postEvent(selectedStop, "incident", {
      category: incidentType,
      note: incidentType === "Otros" ? incidentNote.trim() : "",
    });
  }

  if (screen === "scanner") {
    if (!permission?.granted)
      return (
        <SafeAreaView style={styles.safe}>
          <AppStatusBar />
          <View style={styles.centered}>
            <Text style={styles.eyebrow}>ACCESO A LA CÁMARA</Text>
            <Text style={styles.title}>Permiso de cámara</Text>
            <Text style={styles.muted}>
              Necesitamos la cámara para leer el QR del CMR.
            </Text>
            <PrimaryButton
              label="Permitir cámara"
              onPress={requestPermission}
            />
            <SecondaryButton label="Volver" onPress={() => setScreen("home")} />
          </View>
        </SafeAreaView>
      );
    return (
      <SafeAreaView style={styles.scannerSafe}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => loadTransport(data)}
        />
        <View style={styles.scannerOverlay}>
          <Text style={styles.scannerTitle}>Escanea el QR del CMR</Text>
          <View style={styles.scanFrame} />
          <SecondaryButton label="Cancelar" onPress={() => setScreen("home")} />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "signature" && selectedStop) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppStatusBar />
        <View style={styles.compactHeader}>
          <BackButton onPress={() => setScreen("transport")} />
          <Text style={styles.eyebrow}>POD DIGITAL</Text>
          <Text style={styles.modalTitle}>Firma del destinatario</Text>
          <Text style={styles.compactMeta}>{selectedStop.company}</Text>
        </View>
        <View style={styles.signatureCanvas}>
          <SignatureScreen
            ref={signatureRef}
            onOK={() => {
              setScreen("transport");
              postEvent(selectedStop, "signature", { captured: true });
            }}
            onEmpty={() =>
              Alert.alert(
                "Firma vacía",
                "Introduce una firma antes de confirmar.",
              )
            }
            descriptionText=""
            clearText=""
            confirmText=""
            autoClear
            webStyle={signatureWebStyle}
          />
        </View>
        <View style={styles.signatureBottom}>
          <Text style={styles.signatureHint}>
            Firma dentro del recuadro. Los controles permanecen siempre
            visibles.
          </Text>
          <View style={styles.signatureActions}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.76}
              style={styles.signatureClear}
              onPress={() => signatureRef.current?.clearSignature()}
            >
              <Text style={styles.signatureClearText}>Borrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              style={styles.signatureAccept}
              onPress={() => signatureRef.current?.readSignature()}
            >
              <Text style={styles.signatureAcceptText}>Aceptar firma</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "incident" && selectedStop) {
    const valid = Boolean(
      incidentType && (incidentType !== "Otros" || incidentNote.trim()),
    );
    return (
      <SafeAreaView style={styles.safe}>
        <AppStatusBar />
        <ScrollView
          contentContainerStyle={styles.modalPage}
          keyboardShouldPersistTaps="handled"
        >
          <BackButton onPress={() => setScreen("transport")} />
          <Text style={styles.eyebrow}>INCIDENCIA</Text>
          <Text style={styles.title}>¿Qué ha ocurrido?</Text>
          <Text style={styles.muted}>
            {selectedStop.company} · {selectedStop.stop_type}
          </Text>
          <View style={styles.optionList}>
            {INCIDENT_OPTIONS.map((option) => (
              <TouchableOpacity
                accessibilityRole="radio"
                accessibilityState={{ checked: incidentType === option }}
                activeOpacity={0.78}
                key={option}
                style={[
                  styles.option,
                  incidentType === option && styles.optionSelected,
                ]}
                onPress={() => {
                  setIncidentType(option);
                  if (option !== "Otros") setIncidentNote("");
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    incidentType === option && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
                <Text style={styles.optionCheck}>
                  {incidentType === option ? "●" : "○"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {incidentType === "Otros" && (
            <View>
              <Text style={styles.fieldLabel}>Descripción</Text>
              <TextInput
                value={incidentNote}
                onChangeText={setIncidentNote}
                maxLength={50}
                placeholder="Máximo 50 caracteres"
                placeholderTextColor={COLORS.muted}
                style={styles.noteInput}
              />
              <Text style={styles.counter}>{incidentNote.length}/50</Text>
            </View>
          )}
          <PrimaryButton
            label="Registrar incidencia"
            onPress={
              valid
                ? submitIncident
                : () =>
                    Alert.alert(
                      "Incidencia incompleta",
                      "Selecciona un tipo de incidencia.",
                    )
            }
          />
          <SecondaryButton
            label="Cancelar"
            onPress={() => setScreen("transport")}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "stopDetail" && selectedStop) {
    const orders = selectedStop.orders ?? [];
    return (
      <SafeAreaView style={styles.safe}>
        <AppStatusBar />
        <ScrollView contentContainerStyle={styles.modalPage}>
          <BackButton onPress={() => setScreen(detailOrigin)} />
          <Text style={styles.eyebrow}>
            {selectedStop.stop_type.toUpperCase()} · PARADA{" "}
            {selectedStop.sequence}
          </Text>
          <Text style={styles.title}>{selectedStop.company}</Text>
          <Text style={styles.route}>{selectedStop.address}</Text>
          <View style={styles.detailCard}>
            <DetailRow
              label="Persona de contacto"
              value={selectedStop.contact_name || "No informada"}
            />
            <DetailRow
              label="Teléfono"
              value={selectedStop.contact_phone || "No informado"}
              warning={!selectedStop.contact_phone}
            />
            <DetailRow
              label="Referencia de carga/descarga"
              value={selectedStop.reference || "No informada"}
            />
            <DetailRow
              label="Dirección postal completa"
              value={selectedStop.address}
            />
            <DetailRow
              label="Ventana horaria"
              value={windowLabel(selectedStop)}
            />
            <DetailRow
              label="Llegada"
              value={
                selectedStop.arrived_at
                  ? new Date(selectedStop.arrived_at).toLocaleString("es-ES")
                  : "Pendiente"
              }
            />
          </View>
          {selectedStop.contact_phone && (
            <SecondaryButton
              label="Llamar al contacto"
              onPress={() =>
                Linking.openURL(`tel:${selectedStop.contact_phone}`)
              }
            />
          )}
          <Text style={styles.sectionTitle}>
            Pedidos / partidas relacionados
          </Text>
          {orders.length ? (
            orders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <Text style={styles.orderId}>{order.id}</Text>
                <Text style={styles.orderMeta}>
                  {order.customerId || "Sin Customer ID"}
                </Text>
                {order.description && (
                  <Text style={styles.orderDescription}>
                    {order.description}
                  </Text>
                )}
                <Text style={styles.orderMeta}>
                  {order.packages ?? "—"} bultos ·{" "}
                  {order.weight
                    ? `${Number(order.weight).toLocaleString("es-ES")} kg`
                    : "peso no informado"}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin pedidos comunicados</Text>
              <Text style={styles.emptyText}>
                Esta relación se incorporará desde las partidas de la expedición
                al emitir nuevos CMR.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (
    screen === "transport" &&
    transport &&
    transport.stops.length === 0 &&
    completedStops.length > 0
  ) {
    const document = transport.document;
    const isClosed = document.status === "Cerrado";
    return (
      <SafeAreaView style={styles.safe}>
        <AppStatusBar />
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              onRefresh={() => {
                setRefreshing(true);
                loadTransport(key, true);
              }}
            />
          }
        >
          <View style={styles.topbar}>
            <BackButton
              label="Inicio"
              onPress={isClosed ? startNewWork : () => setScreen("home")}
            />
            <Text style={styles.sync}>● Sincronizado</Text>
          </View>
          <View accessibilityRole="tablist" style={styles.tabs}>
            <View
              accessibilityRole="tab"
              accessibilityState={{ selected: true }}
              style={styles.tabActive}
            >
              <Text style={styles.tabTextActive}>Transporte</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: false }}
              activeOpacity={0.78}
              onPress={() => setScreen("history")}
              style={styles.tab}
            >
              <Text style={styles.tabText}>Histórico</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.eyebrow}>
            {isClosed ? "CMR FINALIZADO" : "TODAS LAS PARADAS COMPLETADAS"}
          </Text>
          <Text style={styles.title}>{document.cmr_number}</Text>
          <Text style={styles.route}>
            {document.pickup_location} → {document.delivery_location}
          </Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {isClosed
                ? "Trabajo finalizado"
                : "Transporte sin paradas pendientes"}
            </Text>
            <Text style={styles.emptyText}>
              {isClosed
                ? "La pantalla de transporte ya no contiene paradas. Todas las tarjetas completadas están disponibles en Histórico."
                : "Todas las tarjetas han pasado a Histórico. Finaliza el trabajo para cerrar este transporte."}
            </Text>
          </View>
          {isClosed ? (
            <PrimaryButton label="Nuevo trabajo" onPress={startNewWork} />
          ) : (
            <PrimaryButton
              label="Finalizar trabajo"
              onPress={() =>
                Alert.alert(
                  "Finalizar trabajo",
                  "¿Deseas cerrar este transporte?",
                  [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Finalizar", onPress: finishWork },
                  ],
                )
              }
            />
          )}
          {loading && <LoadingToast />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if ((screen === "transport" || screen === "history") && transport) {
    const document = transport.document;
    const completed = completedStops;
    const active = transport.stops;
    const canFinish =
      completed.length + active.length > 0 &&
      active.length === 0 &&
      document.status !== "Cerrado";
    return (
      <SafeAreaView style={styles.safe}>
        <AppStatusBar />
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              onRefresh={() => {
                setRefreshing(true);
                loadTransport(key, true);
              }}
            />
          }
        >
          <View style={styles.topbar}>
            <BackButton label="Inicio" onPress={() => setScreen("home")} />
            <Text style={styles.sync}>● Sincronizado</Text>
          </View>
          <View accessibilityRole="tablist" style={styles.tabs}>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === "transport" }}
              activeOpacity={0.78}
              onPress={() => setScreen("transport")}
              style={screen === "transport" ? styles.tabActive : styles.tab}
            >
              <Text
                style={
                  screen === "transport" ? styles.tabTextActive : styles.tabText
                }
              >
                Transporte
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === "history" }}
              activeOpacity={0.78}
              onPress={() => setScreen("history")}
              style={screen === "history" ? styles.tabActive : styles.tab}
            >
              <Text
                style={
                  screen === "history" ? styles.tabTextActive : styles.tabText
                }
              >
                Histórico
              </Text>
            </TouchableOpacity>
          </View>
          {screen === "history" ? (
            <>
              <Text style={styles.eyebrow}>TRAZABILIDAD OPERATIVA</Text>
              <Text style={styles.title}>Paradas finalizadas</Text>
              <Text style={styles.muted}>
                Las paradas pasan de “En progreso” a “Finalizadas” sin poder
                eliminarse.
              </Text>
              <View style={styles.kanban}>
                <View style={styles.kanbanColumn}>
                  <Text style={styles.kanbanLabel}>EN PROGRESO</Text>
                  <Text style={styles.kanbanCount}>{active.length}</Text>
                </View>
                <Text style={styles.kanbanArrow}>→</Text>
                <View style={[styles.kanbanColumn, styles.kanbanDone]}>
                  <Text style={styles.kanbanLabel}>FINALIZADAS</Text>
                  <Text style={styles.kanbanCount}>{completed.length}</Text>
                </View>
              </View>
              {completed.length ? (
                completed.map((stop, index) => (
                  <CompletedStopCard
                    key={stop.id}
                    stop={stop}
                    index={index}
                    onPress={() => openStop(stop, "history")}
                  />
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>
                    Todavía no hay paradas finalizadas
                  </Text>
                  <Text style={styles.emptyText}>
                    Cuando una parada tenga foto POD y se complete, aparecerá
                    aquí.
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>
                CMR IMPORTADO · {document.status}
              </Text>
              <Text style={styles.title}>{document.cmr_number}</Text>
              <Text style={styles.route}>
                {document.pickup_location} → {document.delivery_location}
              </Text>
              <View style={styles.summaryCard}>
                <Summary
                  label="Expedición"
                  value={document.expedition_id || "—"}
                />
                <Summary label="Viaje" value={document.trip_id || "—"} />
                <Summary
                  label="Mercancía"
                  value={`${document.packages ?? "—"} · ${document.goods_description}`}
                />
                <Summary
                  label="Peso"
                  value={
                    document.gross_weight
                      ? `${Number(document.gross_weight).toLocaleString("es-ES")} kg`
                      : "—"
                  }
                />
              </View>
              <PrimaryButton
                label="Proyectar ruta en Maps"
                onPress={openRoute}
              />
              {canFinish && (
                <PrimaryButton
                  label="Finalizar trabajo"
                  onPress={() =>
                    Alert.alert(
                      "Finalizar trabajo",
                      "¿Deseas cerrar este transporte?",
                      [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Finalizar", onPress: finishWork },
                      ],
                    )
                  }
                />
              )}
              <Text style={styles.sectionTitle}>Paradas</Text>
              {transport.stops.map((stop, index) => (
                <View key={stop.id} style={styles.stopCard}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.78}
                    style={styles.stopTop}
                    onPress={() => openStop(stop, "transport")}
                  >
                    <View style={styles.stopIndex}>
                      <Text style={styles.stopIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stopBody}>
                      <Text style={styles.stopType}>{stop.stop_type}</Text>
                      <Text style={styles.stopCompany}>{stop.company}</Text>
                      <Text style={styles.stopMeta}>{stop.address}</Text>
                      <Text style={styles.stopMeta}>{windowLabel(stop)}</Text>
                      {stop.arrived_at && (
                        <Text style={styles.arrivalRecorded}>
                          ● Llegada:{" "}
                          {new Date(stop.arrived_at).toLocaleString("es-ES")}
                        </Text>
                      )}
                      <Text
                        style={
                          stop.contactMissing
                            ? styles.contactMissing
                            : styles.contactOk
                        }
                      >
                        {stop.contactMissing
                          ? "● Sin teléfono de contacto"
                          : `● ${stop.contact_phone}`}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.pending}>{stop.status}</Text>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.stopActions}>
                    <SmallButton
                      tone="primary"
                      label={
                        stop.arrived_at ? "Actualizar llegada" : "He llegado"
                      }
                      onPress={() => markArrival(stop)}
                    />
                    <SmallButton
                      label={`Foto POD (${stop.evidenceCount})`}
                      onPress={() => addPhoto(stop)}
                    />
                    <SmallButton
                      label="Firmar"
                      onPress={() => {
                        setSelectedStop(stop);
                        setScreen("signature");
                      }}
                    />
                    <SmallButton
                      tone="success"
                      label="Completar"
                      onPress={() => postEvent(stop, "complete")}
                    />
                    <SmallButton
                      tone="danger"
                      label="Incidencia"
                      onPress={() => openIncident(stop)}
                    />
                  </View>
                </View>
              ))}
            </>
          )}
          {loading && <LoadingToast />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AppStatusBar />
      <ScrollView
        contentContainerStyle={styles.home}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          accessibilityLabel="4NXA"
          source={require("./assets/wordmark-zen.png")}
          style={styles.logoMark}
          resizeMode="contain"
        />
        <Text style={styles.brand}>FORNEXA MOBILE</Text>
        <Text style={styles.hero}>Tu transporte, sin papeles.</Text>
        <Text style={styles.muted}>
          Importa un CMR real y sincroniza ruta, llegadas, fotografías POD,
          firmas e incidencias.
        </Text>
        <PrimaryButton
          label="Escanear QR"
          onPress={() => setScreen("scanner")}
        />
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>o introduce el código</Text>
          <View style={styles.dividerLine} />
        </View>
        <TextInput
          value={key}
          onChangeText={setKey}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="XXXX-XXXX-XXXX"
          placeholderTextColor={COLORS.muted}
          style={styles.input}
          returnKeyType="go"
          onSubmitEditing={() => loadTransport()}
        />
        <SecondaryButton
          label={loading ? "Importando…" : "Importar CMR"}
          onPress={() => loadTransport()}
        />
        {loading && (
          <ActivityIndicator color={COLORS.primary} style={styles.homeLoader} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function normalizeKey(value: string) {
  const clean = (value.trim().split("?").at(0) ?? "").replace(/\/$/, "");
  const last = clean.includes("/") ? (clean.split("/").pop() ?? "") : clean;
  return last.toUpperCase();
}
function storedCoordinate(stop: Stop) {
  const latitude = Number(stop.latitude),
    longitude = Number(stop.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}
function navigationAddress(value: string) {
  const parts = value
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) ?? value.trim();
}
function messageFor(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
function eventConfirmation(type: EventType, overwritten: boolean) {
  if (type === "complete") return "Parada completada.";
  if (type === "arrival")
    return overwritten
      ? "La llegada anterior se conserva en auditoría y la hora operativa ha sido sustituida."
      : "Llegada registrada con hora y ubicación.";
  if (type === "incident") return "Incidencia registrada.";
  return "Firma registrada.";
}
function windowLabel(stop: Stop) {
  if (!stop.window_start && !stop.window_end)
    return "Ventana horaria no informada";
  const start = stop.window_start
    ? formatDate(stop.window_start)
    : "sin inicio";
  const end = stop.window_end ? formatDate(stop.window_end) : "sin fin";
  return `${start} — ${end}`;
}
function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("es-ES");
}
function AppStatusBar() {
  return (
    <StatusBar
      barStyle="dark-content"
      backgroundColor="transparent"
      translucent
    />
  );
}
function BackButton({
  label = "Volver",
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Volver a ${label}`}
      activeOpacity={0.72}
      style={styles.backButton}
      onPress={onPress}
    >
      <Text style={styles.backArrow}>‹</Text>
      <Text style={styles.back}>{label}</Text>
    </TouchableOpacity>
  );
}
function LoadingToast() {
  return (
    <View accessibilityRole="progressbar" style={styles.loading}>
      <ActivityIndicator color={COLORS.primary} />
      <Text style={styles.loadingText}>Sincronizando…</Text>
    </View>
  );
}
function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.84}
      style={styles.primaryButton}
      onPress={onPress}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}
function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.74}
      style={styles.secondaryButton}
      onPress={onPress}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}
function SmallButton({
  label,
  onPress,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  tone?: "default" | "primary" | "success" | "danger";
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.76}
      style={[
        styles.smallButton,
        tone === "primary" && styles.smallButtonPrimary,
        tone === "success" && styles.smallButtonSuccess,
        tone === "danger" && styles.smallButtonDanger,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.smallButtonText,
          tone === "primary" && styles.smallButtonTextPrimary,
          tone === "success" && styles.smallButtonTextSuccess,
          tone === "danger" && styles.smallButtonTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}
function DetailRow({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={warning ? styles.detailWarning : styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}
function CompletedStopCard({
  stop,
  index,
  onPress,
}: {
  stop: Stop;
  index: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.78}
      style={styles.completedCard}
      onPress={onPress}
    >
      <View style={styles.completedIcon}>
        <Text style={styles.completedIconText}>✓</Text>
      </View>
      <View style={styles.stopBody}>
        <Text style={styles.stopType}>{stop.stop_type} FINALIZADA</Text>
        <Text style={styles.stopCompany}>{stop.company}</Text>
        <Text style={styles.stopMeta}>{stop.address}</Text>
        <Text style={styles.completedDate}>
          {stop.completed_at
            ? new Date(stop.completed_at).toLocaleString("es-ES")
            : "Fecha no informada"}
        </Text>
        <Text style={styles.stopMeta}>
          POD: {stop.evidenceCount} fotografía(s)
        </Text>
      </View>
      <View>
        <Text style={styles.sequenceLabel}>#{index + 1}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const signatureWebStyle = `
  .m-signature-pad { box-shadow:none; border:none; }
  .m-signature-pad--body { top:8px; left:8px; right:8px; bottom:8px; border:1px solid #dce5ec; border-radius:12px; }
  .m-signature-pad--footer { display:none; }
`;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  scannerSafe: { flex: 1, backgroundColor: "#0d2537" },
  home: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: "center",
  },
  scroll: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  modalPage: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  compactHeader: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
  },
  compactMeta: { color: COLORS.muted, fontSize: 14, marginTop: 4 },
  modalTitle: {
    color: COLORS.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    marginTop: 5,
  },
  logoMark: { width: 210, height: 58, marginBottom: 14 },
  brand: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.2,
  },
  hero: {
    color: COLORS.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 10,
  },
  title: {
    color: COLORS.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    marginTop: 5,
  },
  route: {
    color: COLORS.inkSoft,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 6,
    marginBottom: 20,
  },
  muted: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    minHeight: 54,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  primaryButtonText: {
    color: COLORS.surface,
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    minWidth: 180,
    minHeight: 52,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryButtonText: {
    color: COLORS.inkSoft,
    fontWeight: "700",
    fontSize: 15,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
  },
  dividerText: { color: COLORS.muted, fontSize: 12 },
  input: {
    minHeight: 54,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    color: COLORS.ink,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 1.4,
  },
  homeLoader: { marginTop: 18 },
  scannerOverlay: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(5,22,35,.42)",
  },
  scannerTitle: {
    color: COLORS.surface,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  scanFrame: {
    width: 248,
    height: 248,
    borderWidth: 2,
    borderColor: "#d8eaf5",
    borderRadius: 24,
  },
  topbar: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  backButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingRight: 12,
  },
  backArrow: {
    color: COLORS.primary,
    fontSize: 29,
    lineHeight: 32,
    fontWeight: "400",
  },
  back: { color: COLORS.primary, fontSize: 14, fontWeight: "700" },
  sync: { color: COLORS.success, fontSize: 11, fontWeight: "700" },
  tabs: {
    minHeight: 50,
    flexDirection: "row",
    padding: 4,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 14,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 11,
  },
  tabText: { color: COLORS.muted, fontWeight: "600" },
  tabTextActive: { color: COLORS.primary, fontWeight: "700" },
  summaryCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  summaryItem: { width: "50%", paddingRight: 8, marginVertical: 8 },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  summaryValue: { color: COLORS.ink, fontWeight: "700", marginTop: 5 },
  sectionTitle: {
    color: COLORS.ink,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 28,
    marginBottom: 12,
  },
  stopCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stopTop: { minHeight: 72, flexDirection: "row", alignItems: "flex-start" },
  stopIndex: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stopIndexText: { color: COLORS.primary, fontWeight: "700" },
  stopBody: { flex: 1 },
  stopType: {
    color: COLORS.primary,
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  stopCompany: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  stopMeta: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  arrivalRecorded: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
  },
  contactMissing: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
  },
  contactOk: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
  },
  pending: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
  chevron: {
    color: COLORS.muted,
    fontSize: 28,
    textAlign: "right",
    lineHeight: 32,
  },
  stopActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 15,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  smallButton: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  smallButtonSuccess: {
    backgroundColor: COLORS.successSoft,
    borderColor: "#cfe1d9",
  },
  smallButtonDanger: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: "#efd6da",
  },
  smallButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  smallButtonTextPrimary: { color: COLORS.surface },
  smallButtonTextSuccess: { color: COLORS.success },
  smallButtonTextDanger: { color: COLORS.danger },
  loading: {
    position: "absolute",
    zIndex: 10,
    left: 20,
    right: 20,
    bottom: 10,
    minHeight: 48,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingText: { color: COLORS.inkSoft, fontSize: 13, fontWeight: "600" },
  signatureCanvas: {
    flex: 1,
    minHeight: 170,
    maxHeight: 430,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  signatureBottom: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  signatureHint: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  signatureActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  signatureClear: {
    flex: 1,
    minHeight: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  signatureClearText: {
    color: COLORS.inkSoft,
    fontWeight: "700",
    fontSize: 15,
  },
  signatureAccept: {
    flex: 1.4,
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  signatureAcceptText: {
    color: COLORS.surface,
    fontWeight: "700",
    fontSize: 15,
  },
  optionList: { gap: 9 },
  option: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  optionText: { color: COLORS.inkSoft, fontWeight: "600" },
  optionTextSelected: { color: COLORS.primary, fontWeight: "700" },
  optionCheck: { color: COLORS.primary, fontSize: 18 },
  fieldLabel: {
    color: COLORS.inkSoft,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 8,
  },
  noteInput: {
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 14,
    color: COLORS.ink,
    textAlignVertical: "top",
  },
  counter: {
    color: COLORS.muted,
    fontSize: 11,
    textAlign: "right",
    marginTop: 5,
  },
  detailCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 17,
  },
  detailRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  detailLabel: {
    color: COLORS.muted,
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  detailValue: {
    color: COLORS.ink,
    fontWeight: "600",
    marginTop: 5,
    lineHeight: 20,
  },
  detailWarning: { color: COLORS.danger, fontWeight: "700", marginTop: 5 },
  orderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 10,
  },
  orderId: { color: COLORS.ink, fontWeight: "700", fontSize: 16 },
  orderMeta: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  orderDescription: {
    color: COLORS.inkSoft,
    fontWeight: "600",
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  emptyTitle: { color: COLORS.ink, fontWeight: "700" },
  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  kanban: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 20,
  },
  kanbanColumn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  kanbanDone: { borderColor: "#cfe1d9", backgroundColor: COLORS.successSoft },
  kanbanLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  kanbanCount: {
    color: COLORS.ink,
    fontSize: 24,
    fontWeight: "700",
    marginTop: 3,
  },
  kanbanArrow: { color: COLORS.primary, fontSize: 21, fontWeight: "600" },
  completedCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cfe1d9",
    padding: 16,
    marginBottom: 11,
  },
  completedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  completedIconText: { color: COLORS.surface, fontWeight: "700" },
  completedDate: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
  },
  sequenceLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "right",
  },
});
