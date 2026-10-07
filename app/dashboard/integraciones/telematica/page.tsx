import { telematicsProviders } from "../../../../lib/telematics/providers";
import { getProviderReadiness } from "../../../../lib/telematics/runtime";
import TelematicsHubView from "./TelematicsHubView";

export const dynamic = "force-dynamic";

export default function TelematicsHubPage() {
  const readiness = getProviderReadiness();
  return <TelematicsHubView providers={telematicsProviders} readiness={readiness} />;
}
