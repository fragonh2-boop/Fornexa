import type { Metadata } from "next";
import MemorandumView from "./MemorandumView";

export const metadata: Metadata = { title: "Memorándum", description: "Evolución, prioridades y registro público de producto de FORNEXA." };
export default function MemorandumPage() { return <MemorandumView />; }
