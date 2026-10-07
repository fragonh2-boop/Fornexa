import NewTripView from "../../../dashboard/nuevo/viaje/NewTripView";
import { DEMO_TRIP_OPTIONS } from "@/lib/demo-operational-forms";

export default function DemoNewTripPage() {
  return <NewTripView {...DEMO_TRIP_OPTIONS} simulation basePath="/demo" />;
}
