# Modelo de datos operativo de FORNEXA

La base operativa de FORNEXA y la base independiente de `ecmr-cloud` tienen responsabilidades distintas:

- FORNEXA conserva maestros, planificación, ejecución, POD, comunicaciones e integraciones.
- `ecmr-cloud` conserva el registro documental e-CMR, sus versiones y su ledger criptográfico.

## Relaciones principales

```text
Tenant
  ├─ Parties (cliente / proveedor / transportista)
  │    ├─ Addresses
  │    ├─ Contacts
  │    └─ Services
  ├─ Order / Partida
  │    ├─ Order lines
  │    └─ 1..N Delivery notes / Albaranes
  │              └─ N..M Expeditions
  │                        └─ N..M Trips
  │                                  ├─ Stops
  │                                  └─ CMR / POD
  ├─ Offers
  ├─ Customs cases
  ├─ Connectors
  ├─ Communications
  └─ Operational events
```

Durante el piloto, los registros que no indiquen organización reciben el tenant estable `FORNEXA-PILOT`. El modelo ya incluye miembros y políticas RLS para evolucionar a múltiples organizaciones sin mezclar datos.

La migración preserva las tablas existentes `cmr_documents`, `transport_stops`, `transport_events` y `transport_evidence`, añade claves relacionales opcionales y conserva los campos heredados que consumen FORNEXA Web y FORNEXA Mobile.
