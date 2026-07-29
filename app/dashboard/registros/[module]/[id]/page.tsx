import RecordEditor from "./RecordEditor";

export default async function RecordPage({params}:{params:Promise<{module:string;id:string}>}){
 const {module,id}=await params;
 return <RecordEditor module={module} id={decodeURIComponent(id)}/>;
}
