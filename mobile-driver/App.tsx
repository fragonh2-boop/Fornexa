import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  SafeAreaView as NativeSafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import SignatureScreen, { type SignatureViewRef } from "react-native-signature-canvas";

const API_URL = process.env.EXPO_PUBLIC_FORNEXA_API_URL ?? "https://fornexasc.com";
const INCIDENT_OPTIONS = ["Falta mercancía", "Sobra mercancía", "Rotura", "Mojado", "Otros"] as const;

type Screen = "home" | "scanner" | "transport" | "history" | "signature" | "incident" | "stopDetail";
type EventType = "arrival" | "complete" | "incident" | "signature";
type CmrDocument = {id:string;cmr_number:string;status:string;expedition_id?:string;trip_id?:string;sender:string;recipient:string;pickup_location:string;delivery_location:string;goods_description:string;packages?:number;gross_weight?:number};
type StopOrder = {id:string;customerId?:string;description?:string;packages?:number;weight?:number};
type Stop = {id:string;sequence:number;stop_type:"Recogida"|"Entrega";company:string;address:string;window_start?:string;window_end?:string;contact_name?:string;contact_phone?:string;reference?:string;orders?:StopOrder[];contactMissing:boolean;latitude?:number;longitude?:number;status:string;arrived_at?:string;completed_at?:string;evidenceCount:number};
type TransportEvent = {id:string;stop_id?:string;event_type:string;occurred_at:string;payload?:Record<string,unknown>};
type TransportPayload = {document:CmrDocument;stops:Stop[];events:TransportEvent[];sync:{serverTime:string;pollAfterSeconds:number}};

export default function App(){
  const [screen,setScreen]=useState<Screen>("home");
  const [key,setKey]=useState("");
  const [transport,setTransport]=useState<TransportPayload|null>(null);
  const [loading,setLoading]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [selectedStop,setSelectedStop]=useState<Stop|null>(null);
  const [detailOrigin,setDetailOrigin]=useState<"transport"|"history">("transport");
  const [incidentType,setIncidentType]=useState<(typeof INCIDENT_OPTIONS)[number]|null>(null);
  const [incidentNote,setIncidentNote]=useState("");
  const signatureRef=useRef<SignatureViewRef|null>(null);
  const [permission,requestPermission]=useCameraPermissions();
  const normalizedKey=useMemo(()=>normalizeKey(key),[key]);

  const loadTransport=useCallback(async(value=normalizedKey,quiet=false)=>{
    const accessKey=normalizeKey(value);
    if(!accessKey){if(!quiet)Alert.alert("CMR Key","Introduce o escanea una CMR Key válida.");return}
    if(!quiet)setLoading(true);
    try{
      const response=await fetch(`${API_URL}/api/mobile/cmr/${encodeURIComponent(accessKey)}`,{headers:{Accept:"application/json"}});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"No se pudo importar el transporte.");
      setKey(accessKey);setTransport(result);if(!quiet)setScreen("transport");
    }catch(error){if(!quiet)Alert.alert("No se pudo importar",messageFor(error,"Comprueba tu conexión."))}
    finally{if(!quiet)setLoading(false);setRefreshing(false)}
  },[normalizedKey]);

  useEffect(()=>{
    if(!transport||!["transport","history"].includes(screen))return;
    const timer=setInterval(()=>loadTransport(key,true),15000);
    return()=>clearInterval(timer);
  },[key,loadTransport,screen,transport]);

  async function postEvent(stop:Stop,type:EventType,payload:Record<string,unknown>={},overwriteArrival=false){
    try{
      setLoading(true);
      let location:Location.LocationObject|null=null;
      if(type==="arrival"){
        const permissionResult=await Location.requestForegroundPermissionsAsync();
        if(permissionResult.status==="granted")location=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      }
      const response=await fetch(`${API_URL}/api/mobile/stops/${stop.id}/events`,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-fornexa-key":key,"x-idempotency-key":`${stop.id}-${type}-${Date.now()}`},
        body:JSON.stringify({type,occurredAt:new Date().toISOString(),latitude:location?.coords.latitude,longitude:location?.coords.longitude,payload,overwrite:overwriteArrival}),
      });
      const result=await response.json();
      if(response.status===409&&type==="arrival"){
        confirmArrivalOverwrite(stop,result.previousArrival);
        return;
      }
      if(!response.ok)throw new Error(result.error||"No se pudo registrar el evento.");
      await loadTransport(key,true);
      if(type==="complete"&&result.allStopsCompleted){
        Alert.alert(
          "Todas las paradas están completadas",
          "¿Deseas finalizar el trabajo y cerrar este transporte?",
          [{text:"Cancelar",style:"cancel"},{text:"Finalizar",onPress:finishWork}],
        );
        return;
      }
      Alert.alert("Sincronizado",eventConfirmation(type,overwriteArrival));
    }catch(error){Alert.alert("Pendiente",messageFor(error,"No se pudo sincronizar."))}
    finally{setLoading(false)}
  }

  function confirmArrivalOverwrite(stop:Stop,previousArrival=stop.arrived_at){
    const previous=previousArrival?new Date(previousArrival).toLocaleString("es-ES"):"una hora anterior";
    Alert.alert(
      "Llegada ya registrada",
      `Esta parada ya tenía una llegada marcada el ${previous}. ¿Deseas sustituir la hora operativa? El registro anterior se conservará en la auditoría.`,
      [{text:"Cancelar",style:"cancel"},{text:"Sobrescribir",style:"destructive",onPress:()=>postEvent(stop,"arrival",{},true)}],
    );
  }

  function markArrival(stop:Stop){
    if(stop.arrived_at){confirmArrivalOverwrite(stop);return}
    postEvent(stop,"arrival");
  }

  async function finishWork(){
    try{
      setLoading(true);
      const response=await fetch(`${API_URL}/api/mobile/cmr/${encodeURIComponent(key)}/finish`,{
        method:"POST",
        headers:{"x-fornexa-key":key,"x-idempotency-key":`finish-${key}-${Date.now()}`},
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"No se pudo finalizar el trabajo.");
      await loadTransport(key,true);
      Alert.alert("Trabajo finalizado","El transporte se ha cerrado y el evento queda registrado en el histórico.");
    }catch(error){Alert.alert("No se pudo finalizar",messageFor(error,"Comprueba la conexión."))}
    finally{setLoading(false)}
  }

  async function addPhoto(stop:Stop){
    const cameraPermission=await ImagePicker.requestCameraPermissionsAsync();
    if(!cameraPermission.granted){Alert.alert("Permiso de cámara","La fotografía es obligatoria para cerrar la parada.");return}
    const result=await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:.72,exif:false});
    if(result.canceled)return;
    const asset=result.assets[0];if(!asset)return;
    const data=new FormData();
    data.append("stopId",stop.id);
    data.append("photo",{uri:asset.uri,name:asset.fileName??`pod-${Date.now()}.jpg`,type:asset.mimeType??"image/jpeg"} as unknown as Blob);
    try{
      setLoading(true);
      const response=await fetch(`${API_URL}/api/mobile/evidence`,{method:"POST",headers:{"x-fornexa-key":key,"x-idempotency-key":`${stop.id}-photo-${Date.now()}`},body:data});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"No se pudo guardar la foto.");
      await loadTransport(key,true);Alert.alert("Foto sincronizada","La evidencia POD ya forma parte del histórico.");
    }catch(error){Alert.alert("Foto pendiente",messageFor(error,"No se pudo sincronizar."))}
    finally{setLoading(false)}
  }

  async function openRoute(){
    if(!transport?.stops.length)return;
    const ordered=[...transport.stops].sort((a,b)=>a.sequence-b.sequence);
    try{
      setLoading(true);
      if(ordered.some(stop=>!storedCoordinate(stop))){
        const permissionResult=await Location.requestForegroundPermissionsAsync();
        if(permissionResult.status!=="granted")throw new Error("Autoriza la ubicación para convertir las direcciones operativas en coordenadas.");
      }
      const points=await Promise.all(ordered.map(async stop=>{
        const stored=storedCoordinate(stop);if(stored)return stored;
        const address=navigationAddress(stop.address),results=await Location.geocodeAsync(address),point=results[0];
        if(!point)throw new Error(`No se pudo localizar ${stop.company} (${address}).`);
        return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
      }));
      const origin=points[0],destination=points.at(-1);if(!origin||!destination)return;
      const waypoints=points.slice(1,-1).join("|");
      const url=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints?`&waypoints=${encodeURIComponent(waypoints)}`:""}&travelmode=driving`;
      await Linking.openURL(url);
    }catch(error){Alert.alert("Ruta no disponible",messageFor(error,"No se pudieron resolver las coordenadas de la ruta."))}
    finally{setLoading(false)}
  }

  function openStop(stop:Stop,origin:"transport"|"history"){
    setSelectedStop(stop);setDetailOrigin(origin);setScreen("stopDetail");
  }

  function openIncident(stop:Stop){
    setSelectedStop(stop);setIncidentType(null);setIncidentNote("");setScreen("incident");
  }

  function submitIncident(){
    if(!selectedStop||!incidentType)return;
    if(incidentType==="Otros"&&!incidentNote.trim()){Alert.alert("Describe la incidencia","Introduce un texto de hasta 50 caracteres.");return}
    setScreen("transport");
    postEvent(selectedStop,"incident",{category:incidentType,note:incidentType==="Otros"?incidentNote.trim():""});
  }

  if(screen==="scanner"){
    if(!permission?.granted)return <SafeAreaView style={styles.safe}><View style={styles.centered}><Text style={styles.title}>Permiso de cámara</Text><Text style={styles.muted}>Necesitamos la cámara para leer el QR del CMR.</Text><PrimaryButton label="Permitir cámara" onPress={requestPermission}/><SecondaryButton label="Volver" onPress={()=>setScreen("home")}/></View></SafeAreaView>;
    return <SafeAreaView style={styles.safe}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{barcodeTypes:["qr"]}} onBarcodeScanned={({data})=>loadTransport(data)}/><View style={styles.scannerOverlay}><Text style={styles.scannerTitle}>Escanea el QR del CMR</Text><View style={styles.scanFrame}/><SecondaryButton label="Cancelar" onPress={()=>setScreen("home")}/></View></SafeAreaView>;
  }

  if(screen==="signature"&&selectedStop){
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#eef3f9" translucent/><View style={styles.compactHeader}><TouchableOpacity onPress={()=>setScreen("transport")}><Text style={styles.back}>← Volver</Text></TouchableOpacity><Text style={styles.eyebrow}>POD DIGITAL</Text><Text style={styles.modalTitle}>Firma del destinatario</Text><Text style={styles.compactMeta}>{selectedStop.company}</Text></View><View style={styles.signatureCanvas}><SignatureScreen ref={signatureRef} onOK={()=>{setScreen("transport");postEvent(selectedStop,"signature",{captured:true})}} onEmpty={()=>Alert.alert("Firma vacía","Introduce una firma antes de confirmar.")} descriptionText="" clearText="" confirmText="" autoClear webStyle={signatureWebStyle}/></View><View style={styles.signatureBottom}><Text style={styles.signatureHint}>Firma dentro del recuadro. Los controles permanecen siempre visibles.</Text><View style={styles.signatureActions}><TouchableOpacity style={styles.signatureClear} onPress={()=>signatureRef.current?.clearSignature()}><Text style={styles.signatureClearText}>Borrar</Text></TouchableOpacity><TouchableOpacity style={styles.signatureAccept} onPress={()=>signatureRef.current?.readSignature()}><Text style={styles.signatureAcceptText}>Aceptar firma</Text></TouchableOpacity></View></View></SafeAreaView>;
  }

  if(screen==="incident"&&selectedStop){
    const valid=Boolean(incidentType&&(incidentType!=="Otros"||incidentNote.trim()));
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView contentContainerStyle={styles.modalPage} keyboardShouldPersistTaps="handled"><TouchableOpacity onPress={()=>setScreen("transport")}><Text style={styles.back}>← Volver</Text></TouchableOpacity><Text style={styles.eyebrow}>INCIDENCIA</Text><Text style={styles.title}>¿Qué ha ocurrido?</Text><Text style={styles.muted}>{selectedStop.company} · {selectedStop.stop_type}</Text><View style={styles.optionList}>{INCIDENT_OPTIONS.map(option=><TouchableOpacity key={option} style={[styles.option,incidentType===option&&styles.optionSelected]} onPress={()=>{setIncidentType(option);if(option!=="Otros")setIncidentNote("")}}><Text style={[styles.optionText,incidentType===option&&styles.optionTextSelected]}>{option}</Text><Text style={styles.optionCheck}>{incidentType===option?"●":"○"}</Text></TouchableOpacity>)}</View>{incidentType==="Otros"&&<View><Text style={styles.fieldLabel}>Descripción</Text><TextInput value={incidentNote} onChangeText={setIncidentNote} maxLength={50} placeholder="Máximo 50 caracteres" placeholderTextColor="#8290a3" style={styles.noteInput}/><Text style={styles.counter}>{incidentNote.length}/50</Text></View>}<PrimaryButton label="Registrar incidencia" onPress={valid?submitIncident:()=>Alert.alert("Incidencia incompleta","Selecciona un tipo de incidencia.")}/><SecondaryButton label="Cancelar" onPress={()=>setScreen("transport")}/></ScrollView></SafeAreaView>;
  }

  if(screen==="stopDetail"&&selectedStop){
    const orders=selectedStop.orders??[];
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView contentContainerStyle={styles.modalPage}><TouchableOpacity onPress={()=>setScreen(detailOrigin)}><Text style={styles.back}>← Volver</Text></TouchableOpacity><Text style={styles.eyebrow}>{selectedStop.stop_type.toUpperCase()} · PARADA {selectedStop.sequence}</Text><Text style={styles.title}>{selectedStop.company}</Text><Text style={styles.route}>{selectedStop.address}</Text><View style={styles.detailCard}><DetailRow label="Persona de contacto" value={selectedStop.contact_name||"No informada"}/><DetailRow label="Teléfono" value={selectedStop.contact_phone||"No informado"} warning={!selectedStop.contact_phone}/><DetailRow label="Referencia de carga/descarga" value={selectedStop.reference||"No informada"}/><DetailRow label="Dirección postal completa" value={selectedStop.address}/><DetailRow label="Ventana horaria" value={windowLabel(selectedStop)}/><DetailRow label="Llegada" value={selectedStop.arrived_at?new Date(selectedStop.arrived_at).toLocaleString("es-ES"):"Pendiente"}/></View>{selectedStop.contact_phone&&<SecondaryButton label="Llamar al contacto" onPress={()=>Linking.openURL(`tel:${selectedStop.contact_phone}`)}/>}<Text style={styles.sectionTitle}>Pedidos / partidas relacionados</Text>{orders.length?orders.map(order=><View key={order.id} style={styles.orderCard}><Text style={styles.orderId}>{order.id}</Text><Text style={styles.orderMeta}>{order.customerId||"Sin Customer ID"}</Text>{order.description&&<Text style={styles.orderDescription}>{order.description}</Text>}<Text style={styles.orderMeta}>{order.packages??"—"} bultos · {order.weight?`${Number(order.weight).toLocaleString("es-ES")} kg`:"peso no informado"}</Text></View>):<View style={styles.emptyCard}><Text style={styles.emptyTitle}>Sin pedidos comunicados</Text><Text style={styles.emptyText}>Esta relación se incorporará desde las partidas de la expedición al emitir nuevos CMR.</Text></View>}</ScrollView></SafeAreaView>;
  }

  if((screen==="transport"||screen==="history")&&transport){
    const document=transport.document;
    const completed=transport.stops.filter(stop=>stop.status==="Completada");
    const active=transport.stops.filter(stop=>stop.status!=="Completada");
    const canFinish=transport.stops.length>0&&active.length===0&&document.status!=="Cerrado";
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#eef3f9" translucent/><ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);loadTransport(key,true)}}/>}><View style={styles.topbar}><TouchableOpacity onPress={()=>setScreen("home")}><Text style={styles.back}>← Inicio</Text></TouchableOpacity><Text style={styles.sync}>● Sincronizado</Text></View><View style={styles.tabs}><TouchableOpacity onPress={()=>setScreen("transport")} style={screen==="transport"?styles.tabActive:styles.tab}><Text style={screen==="transport"?styles.tabTextActive:styles.tabText}>Transporte</Text></TouchableOpacity><TouchableOpacity onPress={()=>setScreen("history")} style={screen==="history"?styles.tabActive:styles.tab}><Text style={screen==="history"?styles.tabTextActive:styles.tabText}>Histórico</Text></TouchableOpacity></View>{screen==="history"?<><Text style={styles.eyebrow}>TRAZABILIDAD OPERATIVA</Text><Text style={styles.title}>Paradas finalizadas</Text><Text style={styles.muted}>Las paradas pasan de “En progreso” a “Finalizadas” sin poder eliminarse.</Text><View style={styles.kanban}><View style={styles.kanbanColumn}><Text style={styles.kanbanLabel}>EN PROGRESO</Text><Text style={styles.kanbanCount}>{active.length}</Text></View><Text style={styles.kanbanArrow}>→</Text><View style={[styles.kanbanColumn,styles.kanbanDone]}><Text style={styles.kanbanLabel}>FINALIZADAS</Text><Text style={styles.kanbanCount}>{completed.length}</Text></View></View>{completed.length?completed.map((stop,index)=><CompletedStopCard key={stop.id} stop={stop} index={index} onPress={()=>openStop(stop,"history")}/>):<View style={styles.emptyCard}><Text style={styles.emptyTitle}>Todavía no hay paradas finalizadas</Text><Text style={styles.emptyText}>Cuando una parada tenga foto POD y se complete, aparecerá aquí.</Text></View>}</>:<><Text style={styles.eyebrow}>CMR IMPORTADO · {document.status}</Text><Text style={styles.title}>{document.cmr_number}</Text><Text style={styles.route}>{document.pickup_location} → {document.delivery_location}</Text><View style={styles.summaryCard}><Summary label="Expedición" value={document.expedition_id||"—"}/><Summary label="Viaje" value={document.trip_id||"—"}/><Summary label="Mercancía" value={`${document.packages??"—"} · ${document.goods_description}`}/><Summary label="Peso" value={document.gross_weight?`${Number(document.gross_weight).toLocaleString("es-ES")} kg`:"—"}/></View><PrimaryButton label="Proyectar ruta en Maps" onPress={openRoute}/>{canFinish&&<PrimaryButton label="Finalizar trabajo" onPress={()=>Alert.alert("Finalizar trabajo","¿Deseas cerrar este transporte?",[{text:"Cancelar",style:"cancel"},{text:"Finalizar",onPress:finishWork}])}/>}<Text style={styles.sectionTitle}>Paradas</Text>{transport.stops.map((stop,index)=><View key={stop.id} style={styles.stopCard}><TouchableOpacity style={styles.stopTop} onPress={()=>openStop(stop,"transport")}><View style={styles.stopIndex}><Text style={styles.stopIndexText}>{index+1}</Text></View><View style={styles.stopBody}><Text style={styles.stopType}>{stop.stop_type}</Text><Text style={styles.stopCompany}>{stop.company}</Text><Text style={styles.stopMeta}>{stop.address}</Text><Text style={styles.stopMeta}>{windowLabel(stop)}</Text>{stop.arrived_at&&<Text style={styles.arrivalRecorded}>● Llegada: {new Date(stop.arrived_at).toLocaleString("es-ES")}</Text>}<Text style={stop.contactMissing?styles.contactMissing:styles.contactOk}>{stop.contactMissing?"● Sin teléfono de contacto":`● ${stop.contact_phone}`}</Text></View><View><Text style={stop.status==="Completada"?styles.done:styles.pending}>{stop.status}</Text><Text style={styles.chevron}>›</Text></View></TouchableOpacity>{stop.status!=="Completada"&&<View style={styles.stopActions}><SmallButton label={stop.arrived_at?"Actualizar llegada":"He llegado"} onPress={()=>markArrival(stop)}/><SmallButton label={`Foto POD (${stop.evidenceCount})`} onPress={()=>addPhoto(stop)}/><SmallButton label="Firmar" onPress={()=>{setSelectedStop(stop);setScreen("signature")}}/><SmallButton label="Completar" onPress={()=>postEvent(stop,"complete")}/><SmallButton label="Incidencia" onPress={()=>openIncident(stop)}/></View>}</View>)}</>}{loading&&<View style={styles.loading}><ActivityIndicator color="#005d8f"/><Text>Sincronizando…</Text></View>}</ScrollView></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#eef3f9" translucent/><ScrollView contentContainerStyle={styles.home} keyboardShouldPersistTaps="handled"><View style={styles.logoMark}><Text style={styles.logoMarkText}>4NXA</Text></View><Text style={styles.brand}>FORNEXA MOBILE</Text><Text style={styles.hero}>Tu transporte, sin papeles.</Text><Text style={styles.muted}>Importa un CMR real y sincroniza ruta, llegadas, fotografías POD, firmas e incidencias.</Text><PrimaryButton label="Escanear QR" onPress={()=>setScreen("scanner")}/><View style={styles.divider}><View/><Text>o introduce el código</Text><View/></View><TextInput value={key} onChangeText={setKey} autoCapitalize="characters" autoCorrect={false} placeholder="XXXX-XXXX-XXXX" placeholderTextColor="#8290a3" style={styles.input} returnKeyType="go" onSubmitEditing={()=>loadTransport()}/><SecondaryButton label={loading?"Importando…":"Importar CMR"} onPress={()=>loadTransport()}/>{loading&&<ActivityIndicator color="#005d8f" style={{marginTop:18}}/>}</ScrollView></SafeAreaView>;
}

function SafeAreaView({children,style}:{children:ReactNode;style?:StyleProp<ViewStyle>}){
  const androidInsets=Platform.OS==="android"?{paddingTop:StatusBar.currentHeight??24,paddingBottom:12}:undefined;
  return <NativeSafeAreaView style={[style,androidInsets]}>{children}</NativeSafeAreaView>;
}

function normalizeKey(value:string){const clean=(value.trim().split("?").at(0)??"").replace(/\/$/,"");const last=clean.includes("/")?clean.split("/").pop()??"":clean;return last.toUpperCase()}
function storedCoordinate(stop:Stop){const latitude=Number(stop.latitude),longitude=Number(stop.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null;return `${latitude.toFixed(6)},${longitude.toFixed(6)}`}
function navigationAddress(value:string){const parts=value.split("·").map(part=>part.trim()).filter(Boolean);return parts.at(-1)??value.trim()}
function messageFor(error:unknown,fallback:string){return error instanceof Error?error.message:fallback}
function eventConfirmation(type:EventType,overwritten:boolean){if(type==="complete")return "Parada completada.";if(type==="arrival")return overwritten?"La llegada anterior se conserva en auditoría y la hora operativa ha sido sustituida.":"Llegada registrada con hora y ubicación.";if(type==="incident")return "Incidencia registrada.";return "Firma registrada."}
function windowLabel(stop:Stop){if(!stop.window_start&&!stop.window_end)return "Ventana horaria no informada";const start=stop.window_start?formatDate(stop.window_start):"sin inicio";const end=stop.window_end?formatDate(stop.window_end):"sin fin";return `${start} — ${end}`}
function formatDate(value:string){const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:parsed.toLocaleString("es-ES")}
function PrimaryButton({label,onPress}:{label:string;onPress:()=>void}){return <TouchableOpacity style={styles.primaryButton} onPress={onPress}><Text style={styles.primaryButtonText}>{label}</Text></TouchableOpacity>}
function SecondaryButton({label,onPress}:{label:string;onPress:()=>void}){return <TouchableOpacity style={styles.secondaryButton} onPress={onPress}><Text style={styles.secondaryButtonText}>{label}</Text></TouchableOpacity>}
function SmallButton({label,onPress}:{label:string;onPress:()=>void}){return <TouchableOpacity style={styles.smallButton} onPress={onPress}><Text style={styles.smallButtonText}>{label}</Text></TouchableOpacity>}
function Summary({label,value}:{label:string;value:string}){return <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>}
function DetailRow({label,value,warning=false}:{label:string;value:string;warning?:boolean}){return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={warning?styles.detailWarning:styles.detailValue}>{value}</Text></View>}
function CompletedStopCard({stop,index,onPress}:{stop:Stop;index:number;onPress:()=>void}){return <TouchableOpacity style={styles.completedCard} onPress={onPress}><View style={styles.completedIcon}><Text style={styles.completedIconText}>✓</Text></View><View style={styles.stopBody}><Text style={styles.stopType}>{stop.stop_type} FINALIZADA</Text><Text style={styles.stopCompany}>{stop.company}</Text><Text style={styles.stopMeta}>{stop.address}</Text><Text style={styles.completedDate}>{stop.completed_at?new Date(stop.completed_at).toLocaleString("es-ES"):"Fecha no informada"}</Text><Text style={styles.stopMeta}>POD: {stop.evidenceCount} fotografía(s)</Text></View><View><Text style={styles.sequenceLabel}>#{index+1}</Text><Text style={styles.chevron}>›</Text></View></TouchableOpacity>}

const signatureWebStyle=`
  .m-signature-pad { box-shadow:none; border:none; }
  .m-signature-pad--body { top:8px; left:8px; right:8px; bottom:8px; border:1px solid #dbe2ea; border-radius:12px; }
  .m-signature-pad--footer { display:none; }
`;

const styles=Object.assign(StyleSheet.create({
  safe:{flex:1,backgroundColor:"#eef3f9"},home:{flexGrow:1,padding:28,justifyContent:"center"},scroll:{padding:22,paddingBottom:44},centered:{flex:1,justifyContent:"center",padding:28,gap:16},modalPage:{padding:22,paddingBottom:40},compactHeader:{paddingHorizontal:22,paddingTop:14,paddingBottom:8},compactMeta:{color:"#607086",fontSize:14,marginTop:4},modalTitle:{color:"#101216",fontSize:24,fontWeight:"900",marginTop:4},logoMark:{width:70,height:70,borderRadius:20,backgroundColor:"#005d8f",alignItems:"center",justifyContent:"center",marginBottom:18},logoMarkText:{color:"white",fontWeight:"900",fontSize:18},brand:{color:"#005d8f",fontSize:13,fontWeight:"900",letterSpacing:2},hero:{color:"#101216",fontSize:34,lineHeight:39,fontWeight:"900",marginTop:12,marginBottom:10},title:{color:"#101216",fontSize:30,fontWeight:"900",marginTop:4},route:{color:"#526174",fontSize:17,marginTop:5,marginBottom:20},muted:{color:"#607086",fontSize:15,lineHeight:22,marginBottom:24},eyebrow:{color:"#005d8f",fontSize:11,fontWeight:"900",letterSpacing:1.8},primaryButton:{backgroundColor:"#005d8f",borderRadius:16,minHeight:58,alignItems:"center",justifyContent:"center",marginTop:18},primaryButtonText:{color:"white",fontWeight:"900",fontSize:16},secondaryButton:{borderWidth:1,borderColor:"#d6dde7",backgroundColor:"white",borderRadius:16,minHeight:56,alignItems:"center",justifyContent:"center",marginTop:12},secondaryButtonText:{color:"#263343",fontWeight:"800",fontSize:15},divider:{flexDirection:"row",alignItems:"center",gap:10,marginVertical:22},input:{backgroundColor:"white",borderWidth:1,borderColor:"#cbd5e1",borderRadius:16,minHeight:58,paddingHorizontal:18,color:"#101216",textAlign:"center",fontSize:18,fontWeight:"800",letterSpacing:1.4},scannerOverlay:{flex:1,padding:26,alignItems:"center",justifyContent:"space-between",backgroundColor:"rgba(16,18,22,.28)"},scannerTitle:{color:"white",fontSize:20,fontWeight:"900",marginTop:34},scanFrame:{width:260,height:260,borderWidth:3,borderColor:"#4cb5e8",borderRadius:28},topbar:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},back:{color:"#005d8f",fontWeight:"800",marginBottom:16},sync:{color:"#168657",fontSize:11,fontWeight:"800"},tabs:{flexDirection:"row",padding:4,backgroundColor:"#dfe7f0",borderRadius:14,marginBottom:24},tab:{flex:1,padding:11,alignItems:"center"},tabActive:{flex:1,padding:11,alignItems:"center",backgroundColor:"white",borderRadius:11},tabText:{color:"#607086",fontWeight:"800"},tabTextActive:{color:"#005d8f",fontWeight:"900"},summaryCard:{flexDirection:"row",flexWrap:"wrap",backgroundColor:"white",borderRadius:18,padding:18,borderWidth:1,borderColor:"#dbe2ea"},summaryItem:{width:"50%",marginVertical:8},summaryLabel:{color:"#718096",fontSize:11,textTransform:"uppercase",fontWeight:"800"},summaryValue:{color:"#101216",fontWeight:"800",marginTop:4},sectionTitle:{color:"#101216",fontSize:18,fontWeight:"900",marginTop:28,marginBottom:12},stopCard:{padding:16,borderRadius:17,backgroundColor:"white",marginBottom:12,borderWidth:1,borderColor:"#dbe2ea"},stopTop:{flexDirection:"row",alignItems:"flex-start"},stopIndex:{width:36,height:36,borderRadius:18,backgroundColor:"#dcecf5",alignItems:"center",justifyContent:"center",marginRight:12},stopIndexText:{color:"#005d8f",fontWeight:"900"},stopBody:{flex:1},stopType:{color:"#005d8f",fontSize:11,textTransform:"uppercase",fontWeight:"900"},stopCompany:{color:"#101216",fontWeight:"900",marginTop:3},stopMeta:{color:"#607086",fontSize:12,marginTop:3},arrivalRecorded:{color:"#6d5b00",fontSize:11,fontWeight:"800",marginTop:6},contactMissing:{color:"#c43d4d",fontSize:11,fontWeight:"900",marginTop:7},contactOk:{color:"#168657",fontSize:11,fontWeight:"900",marginTop:7},pending:{color:"#b56b00",fontSize:10,fontWeight:"900",textAlign:"right"},done:{color:"#168657",fontSize:10,fontWeight:"900",textAlign:"right"},chevron:{color:"#8290a3",fontSize:30,textAlign:"right",lineHeight:34},stopActions:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:14},smallButton:{paddingVertical:9,paddingHorizontal:11,borderRadius:10,backgroundColor:"#eef3f9",borderWidth:1,borderColor:"#d5dee8"},smallButtonText:{color:"#005d8f",fontSize:11,fontWeight:"900"},loading:{position:"absolute",left:22,right:22,bottom:12,flexDirection:"row",gap:10,justifyContent:"center",alignItems:"center",padding:12,backgroundColor:"white",borderRadius:14,borderWidth:1,borderColor:"#dbe2ea"},signatureCanvas:{height:360,marginHorizontal:18,borderRadius:18,overflow:"hidden",backgroundColor:"white",borderWidth:1,borderColor:"#dbe2ea"},signatureBottom:{paddingHorizontal:18,paddingBottom:14},signatureHint:{color:"#607086",fontSize:12,textAlign:"center",marginTop:10},optionList:{gap:10},option:{minHeight:58,borderRadius:15,borderWidth:1,borderColor:"#d6dde7",backgroundColor:"white",paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},optionSelected:{borderColor:"#005d8f",backgroundColor:"#e1eff7"},optionText:{color:"#263343",fontWeight:"800"},optionTextSelected:{color:"#005d8f"},optionCheck:{color:"#005d8f",fontSize:18},fieldLabel:{color:"#263343",fontWeight:"800",marginTop:18,marginBottom:8},noteInput:{minHeight:92,borderRadius:15,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"white",padding:14,color:"#101216",textAlignVertical:"top"},counter:{color:"#718096",fontSize:11,textAlign:"right",marginTop:5},detailCard:{backgroundColor:"white",borderRadius:18,borderWidth:1,borderColor:"#dbe2ea",paddingHorizontal:17},detailRow:{paddingVertical:14,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#dbe2ea"},detailLabel:{color:"#718096",fontSize:11,textTransform:"uppercase",fontWeight:"800"},detailValue:{color:"#101216",fontWeight:"700",marginTop:5,lineHeight:20},detailWarning:{color:"#c43d4d",fontWeight:"900",marginTop:5},orderCard:{backgroundColor:"white",borderRadius:15,borderWidth:1,borderColor:"#dbe2ea",padding:16,marginBottom:10},orderId:{color:"#101216",fontWeight:"900",fontSize:16},orderMeta:{color:"#607086",fontSize:12,marginTop:4},orderDescription:{color:"#263343",fontWeight:"700",marginTop:8},emptyCard:{backgroundColor:"white",borderRadius:17,borderWidth:1,borderColor:"#dbe2ea",padding:20},emptyTitle:{color:"#101216",fontWeight:"900"},emptyText:{color:"#607086",fontSize:13,lineHeight:19,marginTop:7},kanban:{flexDirection:"row",alignItems:"center",gap:9,marginBottom:20},kanbanColumn:{flex:1,backgroundColor:"white",borderRadius:15,borderWidth:1,borderColor:"#dbe2ea",padding:14},kanbanDone:{borderColor:"#92d1b4",backgroundColor:"#eaf7f0"},kanbanLabel:{color:"#607086",fontSize:10,fontWeight:"900"},kanbanCount:{color:"#101216",fontSize:25,fontWeight:"900",marginTop:3},kanbanArrow:{color:"#005d8f",fontSize:22,fontWeight:"900"},completedCard:{flexDirection:"row",alignItems:"flex-start",backgroundColor:"white",borderRadius:17,borderWidth:1,borderColor:"#b8dfcb",padding:16,marginBottom:11},completedIcon:{width:36,height:36,borderRadius:18,backgroundColor:"#168657",alignItems:"center",justifyContent:"center",marginRight:12},completedIconText:{color:"white",fontWeight:"900"},completedDate:{color:"#168657",fontSize:11,fontWeight:"900",marginTop:7},sequenceLabel:{color:"#607086",fontSize:10,fontWeight:"800",textAlign:"right"}
}),StyleSheet.create({
  signatureActions:{flexDirection:"row",gap:10,marginTop:12},
  signatureClear:{flex:1,minHeight:54,borderRadius:14,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"white",alignItems:"center",justifyContent:"center"},
  signatureClearText:{color:"#263343",fontWeight:"900",fontSize:15},
  signatureAccept:{flex:1.4,minHeight:54,borderRadius:14,backgroundColor:"#005d8f",alignItems:"center",justifyContent:"center"},
  signatureAcceptText:{color:"white",fontWeight:"900",fontSize:15},
}));
