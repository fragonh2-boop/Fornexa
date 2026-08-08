import { customers as masterCustomers } from "../../../../../lib/customer-master";

export type LogisticsPoint={code:string;name:string;customerId?:string;customerCode?:string;partyCode:string;partyName:string;address:string;postalCode:string;city:string;country:string};

const streets=["Av. de la Industria","Calle del Transporte","Calle de los Almacenes","Av. Logística","Calle del Motor","Ronda Industrial","Calle de la Tecnología","Camino del Puerto","Av. del Comercio","Calle de la Cerámica"];
const postalByIndex=(i:number)=>String(46000+((i*137)%7000)).padStart(5,"0");
const operatingCustomers=masterCustomers.slice(0,50);

export const pickupPoints:LogisticsPoint[]=operatingCustomers.map((customer,i)=>({
 code:`REC-${String(i+1).padStart(3,"0")}`,
 name:`${customer.tradeName} · Sede / planta principal`,
 customerId:customer.code,
 customerCode:customer.code,
 partyCode:customer.code,
 partyName:customer.tradeName,
 address:`${streets[i%streets.length]}, ${10+(i*7)%180}`,
 postalCode:postalByIndex(i),city:customer.city,country:customer.country
}));

const deliveryNames=["Plataforma Norte","Centro Distribución Mediterráneo","Hub Regional","Almacén Cliente","Centro Logístico","Delegación Comercial","Planta Industrial","Cross-dock","Depósito Regional","Centro de Consolidación"];
const deliveryCities=["Valencia","Barcelona","Madrid","Zaragoza","Sevilla","Bilbao","Málaga","Alicante","Murcia","Valladolid","Toulouse","Lyon","Marseille","Bordeaux","Nantes","Paris","Lille","Montpellier","Nice","Perpignan"];

export const deliveryPoints:LogisticsPoint[]=Array.from({length:100},(_,i)=>{
 const customer=masterCustomers[i%masterCustomers.length];
 return {
  code:`ENT-${String(i+1).padStart(3,"0")}`,
  name:`${customer.tradeName} · ${deliveryNames[(i*3)%deliveryNames.length]}`,
  customerId:customer.code,
  customerCode:customer.code,
  partyCode:customer.code,
  partyName:customer.tradeName,
  address:`${streets[(i+4)%streets.length]}, ${5+(i*11)%220}`,
  postalCode:String(10000+((i*191)%89999)).padStart(5,"0"),
  city:deliveryCities[(i*7)%deliveryCities.length],
  country:i%5===0?"FR":"ES"
 };
});

export const logisticsParties=[
 ...pickupPoints.map(p=>({code:p.partyCode,customerId:p.customerId,name:p.partyName,type:"REMITENTE",pointCode:p.code})),
 ...deliveryPoints.map(p=>({code:p.partyCode,customerId:p.customerId,name:p.partyName,type:"DESTINATARIO",pointCode:p.code}))
];

export function fullAddress(p:LogisticsPoint){return `${p.address}, ${p.postalCode} ${p.city} (${p.country})`}

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
