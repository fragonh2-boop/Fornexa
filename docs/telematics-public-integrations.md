# FORNEXA — Telematics public integration contracts

Updated: 2026-08-08

## Principle

FORNEXA only hard-codes provider routes that are publicly documented. Where a vendor publishes capabilities but reserves endpoint contracts for partner onboarding, FORNEXA stores auth/base-URL configuration and waits for the official tenant contract instead of guessing routes.

## Providers

### Samsara
- Public base API: `https://api.eu.samsara.com` for EU tachograph use cases.
- Auth: Bearer token or OAuth 2.0. Server-side only.
- Live tachograph: `GET /fleet/tachograph-live-data/latest`.
- Driver activity: `GET /fleet/drivers/tachograph-activity/history`.
- Driver DDD: `GET /fleet/drivers/tachograph-files/history`.
- Vehicle DDD: `GET /fleet/vehicles/tachograph-files/history`.
- Scope: Read Tachograph (EU). EU customer required.
- FORNEXA adapter: executable when `SAMSARA_API_TOKEN` is configured.

### Cartrack
- Public Fleet API/OpenAPI documentation.
- Auth: Basic Authentication.
- Vehicles probe: `GET /rest/vehicles`.
- Driving/rest times: `GET /tachographs/driving-times`.
- Tachograph files: `GET /tachographs`.
- FORNEXA adapter: connectivity probe executable after tenant base URL + credentials.

### FleetGO
- Public REST API documentation.
- Auth: token obtained through `session/Login`, then `Authorization: Bearer {access_token}`.
- JSON/XML and standard REST methods documented publicly.
- Partner onboarding is required for production access and resource validation.
- FORNEXA prepares Bearer/base URL configuration but does not invent resource paths not exposed publicly.

### Webfleet
- WEBFLEET.connect and TachoShare.connect are publicly documented.
- TachoShare uses OAuth 2.0 and supports tachograph/driver-card files.
- API key / .connect Partner enrollment required.
- FORNEXA stores OAuth/API-key/base-URL contract awaiting official credentials and production environment values.

### VDO / Continental
- VDO Fleet Data Services publicly confirms a VDO Fleet Live Data API and real-time tachograph data via Remote DL4G/VDO Link.
- Detailed production API contract is supplied commercially/onboarding.
- FORNEXA therefore prepares credentials/base URL and canonical mapping boundary but no guessed endpoint.

### Volvo Connect
- Volvo exposes an API Manager and developer catalogue; available APIs depend on subscribed services and collected data.
- Driver Times and tachograph file capabilities are subscription-dependent.
- FORNEXA prepares OAuth/base URL configuration awaiting the authorized API catalogue for the tenant.

### Scania
- Scania Developer Portal/Data Access enables server-to-server API access and rFMS-formatted vehicle data.
- Fleet Management/Tachograph Services subscription and vehicle communicator are prerequisites for relevant data.
- FORNEXA prepares OAuth/base URL configuration without guessing portal-specific routes.

### MAN DigitalServices / RIO
- MAN publicly documents DataPackages for API vehicle-data integration, Compliant M for tachograph/card download and Timed for current driving/rest times.
- Production API contract depends on RIO/MAN service activation.
- FORNEXA prepares the connector boundary and credentials/base URL.

### Geotab
- MyGeotab SDK/API is public and cloud-based.
- European tachograph solution includes real-time tachograph data and driving-time status capabilities.
- Authentication is database/user/password against MyGeotab API.
- FORNEXA includes an executable authentication probe and leaves final tachograph queries to the authorized database/API objects.

## Internal APIs

- `GET /api/telematics/health` — registry + readiness. Secret values are never returned.
- `GET /api/telematics/health?provider=<slug>&probe=1` — authenticated provider probe when supported/configured.
- `GET /api/telematics/live?provider=samsara` — Samsara live tachograph data normalized to FORNEXA `DriverStatus`.

## Canonical boundary

All provider payloads must be mapped to `CanonicalDriverStatus` before Decision Center or route planning consumes them. Provider-specific payloads must never leak into planning rules.
