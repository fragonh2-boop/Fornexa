import { notFound } from "next/navigation";
import { dockPortalTokenIsValid } from "@/lib/dock-portal-validation";
import DockPortalClient from "./DockPortalClient";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Reserva de muelle · Fornexa",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function DockPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!dockPortalTokenIsValid(token)) notFound();
  return <DockPortalClient token={token} />;
}
