import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
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
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import SignatureScreen from "react-native-signature-canvas";

const API_URL = process.env.EXPO_PUBLIC_FORNEXA_API_URL ?? "https://fornexasc.com";
type Screen = "home" | "scanner" | "transport" | "history" | "signature";
type CmrDocument={id:string;cmr_number:string;status:string;expedition_id?:string;trip_id?:string;sender:string;recipient:string;pickup_location:string;delivery_location:string;goods_description:string;packages?:number;gross_weight?:number};
type Stop={id:string;sequence:number;stop_type:"Recogida"|"Entrega";company:string;address:string;window_start?:string;window_end?:string;contact_phone?:string;contactMissing:boolean;latitude?:number;longitude?:number;status:string;evidenceCount:number};
type TransportEvent={id:string;stop_id?:string;event_type:string;occurred_at:string;payload?:Record<string,unknown>};
type TransportPayload={document:CmrDocument;stops:Stop[];events:TransportEvent[];sync:{serverTime:string;pollAfterSeconds:number}};

export default function App(){
 const [screen,setScreen]=useState<Screen>("home"),[key,setKey]=useState(""),[transport,setTransport]=useState<TransportPayload|null>(null);
 const [loading,setLoading]=useState(false),[refreshing,setRefreshing]=useState(false),[selectedStop,setSelectedStop]=useState<Stop|null>(null);
 const [permission,requestPermission]=useCameraPermissions();
 const normalizedKey=useMemo(()=>normalizeKey(key),[key]);

 const loadTransport=useCallback(async(value=normalizedKey,quiet=false)=>{
  const accessKey=normalizeKey(value);if(!accessKey){if(!quiet)Alert.alert("CMR Key", "Introduce o escanea una CMR Key válida.");return}
  if(!quiet)setLoading(true);
  try{const response=await fetch(`${API_URL}/api/mobile/cmr/${encodeURIComponent(accessKey)}`,{headers:{Accept:"application/json"}});const result=await response.json();if(!response.ok)throw new Error(result.error||"No se pudo importar el transporte.");setKey(accessKey);setTransport(result);if(!quiet)setScreen("transport")}
  catch(error){if(!quiet)Alert.alert("No se pudo importar",error instanceof Error?error.message:"Comprueba tu conexión.")}
  finally{if(!quiet)setLoading(false);setRefreshing(false)}
 },[normalizedKey]);

 useEffect(()=>{if(!transport||!["transport","history"].includes(screen))return;const timer=setInterval(()=>loadTransport(key,true),15000);return()=>clearInterval(timer)},[key,loadTransport,screen,transport]);

 async function postEvent(stop:Stop,type:"arrival"|"complete"|"incident"|"signature",payload:Record<string,unknown>={}){
  try{setLoading(true);let location:Location.LocationObject|null=null;if(type==="arrival"){const permissionResult=await Location.requestForegroundPermissionsAsync();if(permissionResult.status==="granted")location=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced})}
   const response=await fetch(`${API_URL}/api/mobile/stops/${stop.id}/events`,{method:"POST",headers:{"Content-Type":"application/json","x-fornexa-key":key,"x-idempotency-key":`${stop.id}-${type}-${Date.now()}`},body:JSON.stringify({type,occurredAt:new Date().toISOString(),latitude:location?.coords.latitude,longitude:location?.coords.longitude,payload})});const result=await response.json();if(!response.ok)throw new Error(result.error||"No se pudo registrar el evento.");await loadTransport(key,true);Alert.alert("Sincronizado",type==="complete"?"Parada completada.":type==="arrival"?"Llegada registrada con hora y ubicación.":type==="incident"?"Incidencia registrada.":"Firma registrada.")
  }catch(error){Alert.alert("Pendiente",error instanceof Error?error.message:"No se pudo sincronizar.")}finally{setLoading(false)}}

 async function addPhoto(stop:Stop){
  const cameraPermission=await ImagePicker.requestCameraPermissionsAsync();if(!cameraPermission.granted){Alert.alert("Permiso de cámara","La fotografía es obligatoria para cerrar la parada.");return}
  const result=await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:.72,exif:false});if(result.canceled)return;
  const asset=result.assets[0];if(!asset)return;const data=new FormData();data.append("stopId",stop.id);data.append("photo",{uri:asset.uri,name:asset.fileName??`pod-${Date.now()}.jpg`,type:asset.mimeType??"image/jpeg"} as unknown as Blob);
  try{setLoading(true);const response=await fetch(`${API_URL}/api/mobile/evidence`,{method:"POST",headers:{"x-fornexa-key":key,"x-idempotency-key":`${stop.id}-photo-${Date.now()}`},body:data});const body=await response.json();if(!response.ok)throw new Error(body.error||"No se pudo guardar la foto.");await loadTransport(key,true);Alert.alert("Foto sincronizada","La evidencia POD ya forma parte del histórico.")}
  catch(error){Alert.alert("Foto pendiente",error instanceof Error?error.message:"No se pudo sincronizar.")}finally{setLoading(false)}
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
   if(!(await Linking.canOpenURL(url)))throw new Error("No hay una aplicación de mapas disponible en este dispositivo.");
   await Linking.openURL(url);
  }catch(error){Alert.alert("Ruta no disponible",error instanceof Error?error.message:"No se pudieron resolver las coordenadas de la ruta.")}
  finally{setLoading(false)}
 }

 if(screen==="scanner"){
  if(!permission?.granted)return <SafeAreaView style={styles.safe}><View style={styles.centered}><Text style={styles.title}>Permiso de cámara</Text><Text style={styles.muted}>Necesitamos la cámara para leer el QR del CMR.</Text><PrimaryButton label="Permitir cámara" onPress={requestPermission}/><SecondaryButton label="Volver" onPress={()=>setScreen("home")}/></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{barcodeTypes:["qr"]}} onBarcodeScanned={({data})=>loadTransport(data)}/><View style={styles.scannerOverlay}><Text style={styles.scannerTitle}>Escanea el QR del CMR</Text><View style={styles.scanFrame}/><SecondaryButton label="Cancelar" onPress={()=>setScreen("home")}/></View></SafeAreaView>;
 }

 if(screen==="signature"&&selectedStop)return <SafeAreaView style={styles.safe}><View style={styles.signatureHeader}><Text style={styles.eyebrow}>POD DIGITAL</Text><Text style={styles.title}>Firma del destinatario</Text><Text style={styles.muted}>{selectedStop.company}</Text></View><View style={styles.signatureCanvas}><SignatureScreen onOK={()=>{setScreen("transport");postEvent(selectedStop,"signature")}} onEmpty={()=>Alert.alert("Firma vacía","Introduce una firma antes de confirmar.")} descriptionText="Firma aquí" clearText="Borrar" confirmText="Confirmar" webStyle=".m-signature-pad--footer {display:flex; gap:8px;} .m-signature-pad--body {border:none;}"/></View><View style={styles.bottomAction}><SecondaryButton label="Cancelar" onPress={()=>setScreen("transport")}/></View></SafeAreaView>;

 if((screen==="transport"||screen==="history")&&transport){const document=transport.document;return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);loadTransport(key,true)}}/>}>
  <View style={styles.topbar}><TouchableOpacity onPress={()=>setScreen("home")}><Text style={styles.back}>← Inicio</Text></TouchableOpacity><Text style={styles.sync}>● Sincronizado</Text></View>
  <View style={styles.tabs}><TouchableOpacity onPress={()=>setScreen("transport")} style={screen==="transport"?styles.tabActive:styles.tab}><Text style={screen==="transport"?styles.tabTextActive:styles.tabText}>Transporte</Text></TouchableOpacity><TouchableOpacity onPress={()=>setScreen("history")} style={screen==="history"?styles.tabActive:styles.tab}><Text style={screen==="history"?styles.tabTextActive:styles.tabText}>Histórico</Text></TouchableOpacity></View>
  {screen==="history"?<History events={transport.events}/>:<><Text style={styles.eyebrow}>CMR IMPORTADO · {document.status}</Text><Text style={styles.title}>{document.cmr_number}</Text><Text style={styles.route}>{document.pickup_location} → {document.delivery_location}</Text><View style={styles.summaryCard}><Summary label="Expedición" value={document.expedition_id||"—"}/><Summary label="Viaje" value={document.trip_id||"—"}/><Summary label="Mercancía" value={`${document.packages??"—"} · ${document.goods_description}`}/><Summary label="Peso" value={document.gross_weight?`${Number(document.gross_weight).toLocaleString("es-ES")} kg`:"—"}/></View><PrimaryButton label="Proyectar ruta en Maps" onPress={openRoute}/><Text style={styles.sectionTitle}>Paradas</Text>{transport.stops.map((stop,index)=><View key={stop.id} style={styles.stopCard}><View style={styles.stopTop}><View style={styles.stopIndex}><Text style={styles.stopIndexText}>{index+1}</Text></View><View style={styles.stopBody}><Text style={styles.stopType}>{stop.stop_type}</Text><Text style={styles.stopCompany}>{stop.company}</Text><Text style={styles.stopMeta}>{stop.address}</Text><Text style={styles.stopMeta}>{stop.window_start?new Date(stop.window_start).toLocaleString("es-ES"):"Ventana horaria no informada"}</Text><Text style={stop.contactMissing?styles.contactMissing:styles.contactOk}>{stop.contactMissing?"● Sin teléfono de contacto":`● ${stop.contact_phone}`}</Text></View><Text style={stop.status==="Completada"?styles.done:styles.pending}>{stop.status}</Text></View><View style={styles.stopActions}><SmallButton label="He llegado" onPress={()=>postEvent(stop,"arrival")}/><SmallButton label={`Foto POD (${stop.evidenceCount})`} onPress={()=>addPhoto(stop)}/><SmallButton label="Firmar" onPress={()=>{setSelectedStop(stop);setScreen("signature")}}/><SmallButton label="Completar" onPress={()=>postEvent(stop,"complete")}/><SmallButton label="Incidencia" onPress={()=>postEvent(stop,"incident",{note:"Incidencia comunicada desde Driver"})}/></View></View>)}</>}
  {loading&&<View style={styles.loading}><ActivityIndicator color="#005d8f"/><Text>Sincronizando…</Text></View>}
 </ScrollView></SafeAreaView>}

 return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView contentContainerStyle={styles.home} keyboardShouldPersistTaps="handled"><View style={styles.logoMark}><Text style={styles.logoMarkText}>4NXA</Text></View><Text style={styles.brand}>FORNEXA DRIVER</Text><Text style={styles.hero}>Tu transporte, sin papeles.</Text><Text style={styles.muted}>Importa un CMR real y sincroniza ruta, llegadas, fotografías POD, firmas e incidencias.</Text><PrimaryButton label="Escanear QR" onPress={()=>setScreen("scanner")}/><View style={styles.divider}><View/><Text>o introduce el código</Text><View/></View><TextInput value={key} onChangeText={setKey} autoCapitalize="characters" autoCorrect={false} placeholder="XXXX-XXXX-XXXX" placeholderTextColor="#8290a3" style={styles.input} returnKeyType="go" onSubmitEditing={()=>loadTransport()}/><SecondaryButton label={loading?"Importando…":"Importar CMR"} onPress={()=>loadTransport()}/>{loading&&<ActivityIndicator color="#005d8f" style={{marginTop:18}}/>}</ScrollView></SafeAreaView>
}

function normalizeKey(value:string){const clean=(value.trim().split("?").at(0)??"").replace(/\/$/,"");const last=clean.includes("/")?clean.split("/").pop()??"":clean;return last.toUpperCase()}
function storedCoordinate(stop:Stop){const latitude=Number(stop.latitude),longitude=Number(stop.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null;return `${latitude.toFixed(6)},${longitude.toFixed(6)}`}
function navigationAddress(value:string){const parts=value.split("·").map(part=>part.trim()).filter(Boolean);return parts.at(-1)??value.trim()}
function PrimaryButton({label,onPress}:{label:string;onPress:()=>void}){return <TouchableOpacity style={styles.primaryButton} onPress={onPress}><Text style={styles.primaryButtonText}>{label}</Text></TouchableOpacity>}
function SecondaryButton({label,onPress}:{label:string;onPress:()=>void}){return <TouchableOpacity style={styles.secondaryButton} onPress={onPress}><Text style={styles.secondaryButtonText}>{label}</Text></TouchableOpacity>}
function SmallButton({label,onPress}:{label:string;onPress:()=>void}){return <TouchableOpacity style={styles.smallButton} onPress={onPress}><Text style={styles.smallButtonText}>{label}</Text></TouchableOpacity>}
function Summary({label,value}:{label:string;value:string}){return <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>}
function History({events}:{events:TransportEvent[]}){return <View><Text style={styles.eyebrow}>TRAZABILIDAD</Text><Text style={styles.title}>Histórico inmutable</Text><Text style={styles.muted}>Ordenado por fecha y vinculado al CMR, expedición y paradas.</Text>{events.length?events.map(event=><View key={event.id} style={styles.historyCard}><Text style={styles.historyType}>{event.event_type.replaceAll("_"," ")}</Text><Text style={styles.historyDate}>{new Date(event.occurred_at).toLocaleString("es-ES")}</Text></View>):<Text style={styles.muted}>Todavía no hay eventos.</Text>}</View>}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:"#eef3f9"},home:{flexGrow:1,padding:28,justifyContent:"center"},scroll:{padding:22,paddingBottom:44},centered:{flex:1,justifyContent:"center",padding:28,gap:16},logoMark:{width:70,height:70,borderRadius:20,backgroundColor:"#005d8f",alignItems:"center",justifyContent:"center",marginBottom:18},logoMarkText:{color:"white",fontWeight:"900",fontSize:18},brand:{color:"#005d8f",fontSize:13,fontWeight:"900",letterSpacing:2},hero:{color:"#101216",fontSize:34,lineHeight:39,fontWeight:"900",marginTop:12,marginBottom:10},title:{color:"#101216",fontSize:30,fontWeight:"900",marginTop:4},route:{color:"#526174",fontSize:17,marginTop:5,marginBottom:20},muted:{color:"#607086",fontSize:15,lineHeight:22,marginBottom:24},eyebrow:{color:"#005d8f",fontSize:11,fontWeight:"900",letterSpacing:1.8},primaryButton:{backgroundColor:"#005d8f",borderRadius:16,minHeight:58,alignItems:"center",justifyContent:"center",marginTop:18},primaryButtonText:{color:"white",fontWeight:"900",fontSize:16},secondaryButton:{borderWidth:1,borderColor:"#d6dde7",backgroundColor:"white",borderRadius:16,minHeight:56,alignItems:"center",justifyContent:"center",marginTop:12},secondaryButtonText:{color:"#263343",fontWeight:"800",fontSize:15},divider:{flexDirection:"row",alignItems:"center",gap:10,marginVertical:22},dividerText:{color:"#607086"},input:{backgroundColor:"white",borderWidth:1,borderColor:"#cbd5e1",borderRadius:16,minHeight:58,paddingHorizontal:18,color:"#101216",textAlign:"center",fontSize:18,fontWeight:"800",letterSpacing:1.4},scannerOverlay:{flex:1,padding:26,alignItems:"center",justifyContent:"space-between",backgroundColor:"rgba(16,18,22,.28)"},scannerTitle:{color:"white",fontSize:20,fontWeight:"900",marginTop:34},scanFrame:{width:260,height:260,borderWidth:3,borderColor:"#4cb5e8",borderRadius:28},topbar:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},back:{color:"#005d8f",fontWeight:"800"},sync:{color:"#168657",fontSize:11,fontWeight:"800"},tabs:{flexDirection:"row",padding:4,backgroundColor:"#dfe7f0",borderRadius:14,marginBottom:24},tab:{flex:1,padding:11,alignItems:"center"},tabActive:{flex:1,padding:11,alignItems:"center",backgroundColor:"white",borderRadius:11},tabText:{color:"#607086",fontWeight:"800"},tabTextActive:{color:"#005d8f",fontWeight:"900"},summaryCard:{flexDirection:"row",flexWrap:"wrap",backgroundColor:"white",borderRadius:18,padding:18,borderWidth:1,borderColor:"#dbe2ea"},summaryItem:{width:"50%",marginVertical:8},summaryLabel:{color:"#718096",fontSize:11,textTransform:"uppercase",fontWeight:"800"},summaryValue:{color:"#101216",fontWeight:"800",marginTop:4},sectionTitle:{color:"#101216",fontSize:18,fontWeight:"900",marginTop:28,marginBottom:12},stopCard:{padding:16,borderRadius:17,backgroundColor:"white",marginBottom:12,borderWidth:1,borderColor:"#dbe2ea"},stopTop:{flexDirection:"row",alignItems:"flex-start"},stopIndex:{width:36,height:36,borderRadius:18,backgroundColor:"#dcecf5",alignItems:"center",justifyContent:"center",marginRight:12},stopIndexText:{color:"#005d8f",fontWeight:"900"},stopBody:{flex:1},stopType:{color:"#005d8f",fontSize:11,textTransform:"uppercase",fontWeight:"900"},stopCompany:{color:"#101216",fontWeight:"900",marginTop:3},stopMeta:{color:"#607086",fontSize:12,marginTop:3},contactMissing:{color:"#c43d4d",fontSize:11,fontWeight:"900",marginTop:7},contactOk:{color:"#168657",fontSize:11,fontWeight:"900",marginTop:7},pending:{color:"#b56b00",fontSize:10,fontWeight:"900"},done:{color:"#168657",fontSize:10,fontWeight:"900"},stopActions:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:14},smallButton:{paddingVertical:9,paddingHorizontal:11,borderRadius:10,backgroundColor:"#eef3f9",borderWidth:1,borderColor:"#d5dee8"},smallButtonText:{color:"#005d8f",fontSize:11,fontWeight:"900"},historyCard:{padding:16,backgroundColor:"white",borderWidth:1,borderColor:"#dbe2ea",borderRadius:14,marginBottom:9},historyType:{color:"#101216",fontWeight:"900",textTransform:"capitalize"},historyDate:{color:"#607086",fontSize:12,marginTop:4},loading:{position:"absolute",left:22,right:22,bottom:12,flexDirection:"row",gap:10,justifyContent:"center",alignItems:"center",padding:12,backgroundColor:"white",borderRadius:14,borderWidth:1,borderColor:"#dbe2ea"},signatureHeader:{padding:22,paddingBottom:14},signatureCanvas:{flex:1,marginHorizontal:18,borderRadius:18,overflow:"hidden",backgroundColor:"white"},bottomAction:{padding:18}
});
