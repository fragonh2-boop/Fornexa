"use client";

export default function AppShell({children}:{children:React.ReactNode}){
  return <main style={{minHeight:"100vh",width:"100%",minWidth:0,maxWidth:"100%",background:"#eef3f9",color:"#101216"}}>
    <section style={{minWidth:0,width:"100%",maxWidth:"100%",padding:"34px 38px 50px",overflowX:"hidden"}}>{children}</section>
  </main>;
}
