import { notFound } from "next/navigation";
import TripDetailView from "../../../dashboard/viajes/[id]/TripDetailView";
import { DEMO_TRIP_DETAILS } from "@/lib/demo-operational-forms";

export default async function DemoTripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = DEMO_TRIP_DETAILS.find(item => item.code === id);
  if (!trip) notFound();
  return <TripDetailView trip={trip} simulation basePath="/demo" />;
}
