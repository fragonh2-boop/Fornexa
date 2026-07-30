export type LogisticsPoint={code:string;name:string;customerCode?:string;partyCode:string;partyName:string;address:string;postalCode:string;city:string;country:string};

const customers=[
["10001","Bosch España","Madrid"],["10002","Ford España","Almussafes"],["10003","Stadler Rail Valencia","Albuixech"],["10004","Power Electronics","Llíria"],["10005","Porcelanosa Grupo","Vila-real"],["10006","Keraben Grupo","Nules"],["10007","Pamesa Cerámica","Almassora"],["10008","Roca Corporación","Gavà"],["10009","Gestamp","Madrid"],["10010","CIE Automotive","Bilbao"],["10011","Ficosa","Viladecavalls"],["10012","Grupo Antolin","Burgos"],["10013","Faurecia Automotive","Valencia"],["10014","Michelin España","Tres Cantos"],["10015","Bridgestone Hispania","Basauri"],["10016","Airbus España","Getafe"],["10017","Navantia","Madrid"],["10018","CAF","Beasain"],["10019","Talgo","Las Rozas"],["10020","Siemens Mobility","Tres Cantos"],["10021","Schneider Electric","Barcelona"],["10022","ABB España","Madrid"],["10023","Saint-Gobain","Madrid"],["10024","ArcelorMittal España","Avilés"],["10025","Acerinox","Los Barrios"],["10026","Celsa Group","Castellbisbal"],["10027","Sidenor","Basauri"],["10028","Tubacex","Amurrio"],["10029","Repsol Química","Madrid"],["10030","Cepsa Química","Madrid"],["10031","BASF Española","Tarragona"],["10032","Bayer Hispania","Sant Joan Despí"],["10033","Henkel Ibérica","Barcelona"],["10034","Procter & Gamble España","Madrid"],["10035","Unilever España","Viladecans"],["10036","Nestlé España","Esplugues de Llobregat"],["10037","Danone España","Barcelona"],["10038","Mahou San Miguel","Madrid"],["10039","Heineken España","Sevilla"],["10040","Damm","Barcelona"],["10041","Campofrío","Burgos"],["10042","El Pozo Alimentación","Alhama de Murcia"],["10043","Grupo Siro","Venta de Baños"],["10044","Gullón","Aguilar de Campoo"],["10045","Mango Logística","Lliçà d'Amunt"],["10046","Inditex Logística","Arteixo"],["10047","Mercadona Logística","Tavernes Blanques"],["10048","Consum Cooperativa","Silla"],["10049","SPB Global","Cheste"],["10050","Importaco","Beniparrell"]
] as const;

const streets=["Av. de la Industria","Calle del Transporte","Calle de los Almacenes","Av. Logística","Calle del Motor","Ronda Industrial","Calle de la Tecnología","Camino del Puerto","Av. del Comercio","Calle de la Cerámica"];
const postalByIndex=(i:number)=>String(46000+((i*137)%7000)).padStart(5,"0");

export const pickupPoints:LogisticsPoint[]=customers.map(([customerCode,name,city],i)=>({
 code:`REC-${String(i+1).padStart(3,"0")}`,
 name:`${name} · Sede / planta principal`,
 customerCode,
 partyCode:customerCode,
 partyName:name,
 address:`${streets[i%streets.length]}, ${10+(i*7)%180}`,
 postalCode:postalByIndex(i),city,country:"ES"
}));

const deliveryNames=["Plataforma Norte","Centro Distribución Mediterráneo","Hub Regional","Almacén Cliente","Centro Logístico","Delegación Comercial","Planta Industrial","Cross-dock","Depósito Regional","Centro de Consolidación"];
const deliveryCities=["Valencia","Barcelona","Madrid","Zaragoza","Sevilla","Bilbao","Málaga","Alicante","Murcia","Valladolid","Toulouse","Lyon","Marseille","Bordeaux","Nantes","Paris","Lille","Montpellier","Nice","Perpignan"];
const deliveryCustomers=["Mediterránea Retail","Nova Distribution","Atlas Components","Nordic Home","Eurotech Parts","Iberian Foods","Continental Stores","Global Ceramic","Automotive Systems","Pharma Logistics"];

export const deliveryPoints:LogisticsPoint[]=Array.from({length:100},(_,i)=>({
 code:`ENT-${String(i+1).padStart(3,"0")}`,
 name:`${deliveryCustomers[i%deliveryCustomers.length]} · ${deliveryNames[(i*3)%deliveryNames.length]}`,
 partyCode:`DST-${String(i+1).padStart(5,"0")}`,
 partyName:deliveryCustomers[i%deliveryCustomers.length],
 address:`${streets[(i+4)%streets.length]}, ${5+(i*11)%220}`,
 postalCode:String(10000+((i*191)%89999)).padStart(5,"0"),
 city:deliveryCities[(i*7)%deliveryCities.length],
 country:i%5===0?"FR":"ES"
}));

export const logisticsParties=[
 ...pickupPoints.map(p=>({code:p.partyCode,name:p.partyName,type:"REMITENTE",pointCode:p.code})),
 ...deliveryPoints.map(p=>({code:p.partyCode,name:p.partyName,type:"DESTINATARIO",pointCode:p.code}))
];

export function fullAddress(p:LogisticsPoint){return `${p.address}, ${p.postalCode} ${p.city} (${p.country})`}

// Sincroniza los campos de tercero cuando se introduce un código maestro de punto.
// Se mantiene editable: el usuario puede sobrescribir remitente o destinatario después.
if(typeof window!=="undefined"){
 const marker="fornexaPointPartyAutofill";
 const w=window as typeof window&{[key:string]:unknown};
 if(!w[marker]){
  w[marker]=true;
  const setNativeValue=(input:HTMLInputElement,value:string)=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
   setter?.call(input,value);
   input.dispatchEvent(new Event("input",{bubbles:true}));
   input.dispatchEvent(new Event("change",{bubbles:true}));
  };
  document.addEventListener("input",event=>{
   const source=event.target;
   if(!(source instanceof HTMLInputElement))return;
   const code=source.value.trim().toUpperCase();
   if(source.name==="codigoOrigen"){
    const point=pickupPoints.find(p=>p.code===code);
    const target=document.querySelector<HTMLInputElement>('input[name="remitente"]');
    if(point&&target)setNativeValue(target,point.partyCode);
   }
   if(source.name==="codigoDestino"){
    const point=deliveryPoints.find(p=>p.code===code);
    const target=document.querySelector<HTMLInputElement>('input[name="destinatario"]');
    if(point&&target)setNativeValue(target,point.partyCode);
   }
  });
  try{localStorage.setItem("fornexa-terceros-logisticos",JSON.stringify(logisticsParties))}catch{}
 }
}
