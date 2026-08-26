import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "./login.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LoginLayout({ children }: { children: ReactNode }) {
  // Touch the request cookie store so /login is rendered per-request instead of
  // being prerendered into a stale client bundle across auth deployments.
  await cookies();
  return children;
}
