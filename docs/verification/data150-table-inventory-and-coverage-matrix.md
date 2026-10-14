# FORNEXA — Matriz de Cobertura y Clasificación de Esquema (DATA150-PRODUCTION-20261009)

Fecha: 2026-10-09 | Tenant: `tenant titular FORNEXA`
Total tablas inspeccionadas: 89 | Reconciliación: 100% de tablas del esquema

---

## Resumen Ejecutivo de Clasificación (89 Tablas Totales)
- **Tablas de negocio objetivo (70 tablas):** 150 filas sintéticas completas, distintas y coherentes generadas por tabla (10.500 filas de prueba identificadas), incorporando firmas simuladas (`cmr_signatures`), evidencias de transporte (`transport_evidence`) y artefactos documentales regulatorios (`regulatory_document_artifacts`) conforme a la decisión formal de Fran (Opción B) para testeo de flujos completos.
- **Tablas excluidas por autenticación, tokens, migraciones y auditoría (7 tablas):** Preservadas intactas sin datos ficticios.
- **Tablas reclasificadas como logs técnicos / despacho / revisiones (2 tablas):** Excluidas de carga operativa para no ensuciar colas de sincronización móvil o ledger interno (`entity_revisions`, `device_revision_dispatches`).
- **Catálogos finitos estándar legítimos < 150 (3 tablas):** Unidades de medida ISO/UNECE y edición activa de tratado internacional (`uom_definitions`, `uom_conversions`, `hazmat_editions`).
- **Catálogos normativos ADR preservados y asignaciones dependientes (7 tablas):** Preservación de seguridad legal; prohibido contaminar catálogos normativos ADR activos o inventar reglas de seguridad (`hazmat_entries`, `hazmat_entry_synonyms`, `hazmat_packaging_types`, `hazmat_entry_packaging_options`, `hazmat_transport_category_rules`, `order_line_hazmat`, `product_hazmat_assignments`).

---

## 1. Tablas Excluidas: Sistema, Auth, Tokens, Migraciones, Auditoría (7 tablas)
| Tabla | Justificación estricta de exclusión |
| --- | --- |
| `public.audit_events` | Registro append-only de auditoría interna del sistema; excluido por mandato expreso de la delegación. |
| `public.cmr_view_sessions` | Hashes criptográficos de sesión y tokens de acceso público temporal a eCMR. |
| `public.fornexa_schema_migrations` | Ledger inmutable de control de migraciones de base de datos. |
| `public.mobile_trip_access` | Credenciales, hashes y códigos PIN de acceso para dispositivos móviles de conductores. |
| `public.regulatory_document_access_tokens` | Tokens criptográficos de acceso seguro a artefactos documentales DeCA. |
| `public.tenant_members` | Membresías de usuario y autenticación; prohibido crear usuarios o miembros sintéticos. |
| `public.tenants` | Raíz de multitenencia del sistema; prohibido crear tenants sintéticos para no desvirtuar el entorno. |

---

## 2. Decisión de Fran sobre Tablas Regulatorias y Legales (Opción B: Flujos Completos de Testeo)
Fran ha resuelto expresamente adoptar la **Opción B**: generar datos sintéticos de prueba rotulados inequívocamente como `[PRUEBA]` / mock en `cmr_signatures`, `transport_evidence` y `regulatory_document_artifacts` (150 filas completas en cada una).
Esta decisión permite validar y testear en producción flujos de datos operativos de extremo a extremo (visores de cartas de porte firmadas, galerías de evidencias de transporte y consulta de artefactos documentales), garantizando que cuando la aplicación se entregue a terceros clientes reales de Fornexa se entregará completamente libre de valores.
Las 3 tablas pasan a integrarse en el lote de negocio objetivo bajo la Capa 8 de dependencia topológica.

---

## 3. Tablas Excluidas: Logs Técnicos, Despacho y Revisiones (2 tablas)
| Tabla | Justificación estricta de exclusión |
| --- | --- |
| `public.entity_revisions` | Ledger técnico de snapshots de revisión de entidades de sistema. Depende de `created_by -> auth.users`. Excluido de fixtures para evitar saturar el subsistema de auditoría de entidades. |
| `public.device_revision_dispatches` | Cola técnica de despacho de revisiones hacia dispositivos móviles. Depende de `entity_revisions`. Excluido para no generar tráfico falso a dispositivos. |

---

## 4. Catálogos Finitos Estándar Legítimos (Cardinalidad legítima < 150) (3 tablas)
| Tabla | Cardinalidad Legítima | Justificación de cardinalidad |
| --- | ---: | --- |
| `public.hazmat_editions` | 1 | Ediciones bianuales del tratado internacional ADR (1 edición activa: tratado oficial `ADR_2025`). |
| `public.uom_conversions` | 6 | Factores matemáticos de conversión entre unidades estándar de masa, volumen y embalaje. |
| `public.uom_definitions` | 10 | Catálogo normativo de unidades de medida estándar UNECE/ISO (KG, G, T, M, M2, M3, L, PAL, PKG, UN). |

---

## 5. Catálogos Normativos ADR Preservados y Asignaciones Dependientes (7 tablas)
| Tabla | Justificación estricta de preservación normativa |
| --- | --- |
| `public.hazmat_entries` | Catálogo oficial de materias peligrosas (números ONU). Sin filas en producción. Prohibido fabricar sustancias o reglas ADR sintéticas en catálogo global sin tenant. |
| `public.hazmat_entry_packaging_options` | Opciones oficiales de embalaje autorizadas por código ADR. Depende de `hazmat_entries(id)`. |
| `public.hazmat_entry_synonyms` | Sinónimos y denominaciones químicas oficiales según tratado ADR. Depende de `hazmat_entries(id)`. |
| `public.hazmat_packaging_types` | Tipos normativos oficiales de embalaje ADR (bidones 1A1, cajas 4G, etc.). |
| `public.hazmat_transport_category_rules` | Reglas matemáticas de exención parcial 1.1.3.6 según categoría de transporte ADR. |
| `public.order_line_hazmat` | Requiere clave foránea estricta `hazmat_entry_id -> hazmat_entries(id)`. Al estar vacío el catálogo normativo y no autorizarse la contaminación del mismo, no puede poblarse sin violar integridad o seguridad legal. |
| `public.product_hazmat_assignments` | Requiere clave foránea estricta `hazmat_entry_id -> hazmat_entries(id)`. Misma justificación de fail-closed normativo. |

---

## 6. Tablas de Negocio Objetivo (70 tablas — 150 filas sintéticas completas cada una)
Orden topológico estricto de inserción (0 dependencias circulares, 100% de claves foráneas resueltas).
> Para el inventario exhaustivo columna por columna (993 columnas totales) y el detalle de las 196 restricciones de clave foránea resueltas, véase [Matriz Detallada de Cobertura por Campo y Claves Foráneas](data150-field-and-fk-coverage-matrix.md).

| # | Capa | Tabla | Objetivo Batch | Columnas Totales | Clave Primaria (PK) | Dependencias Foráneas |
| --- | --- | --- | ---: | ---: | --- | --- |
| 1 | L1 | `public.tariff_zones` | +150 | 7 | `id` | `tenants` |
| 2 | L1 | `public.operational_events` | +150 | 11 | `(id / entity_code)` | `tenants` |
| 3 | L1 | `public.local_storage_sync_runs` | +150 | 11 | `id` | `tenants` |
| 4 | L1 | `public.external_identifiers` | +150 | 9 | `id` | `tenants` |
| 5 | L1 | `public.customs_cases` | +150 | 13 | `id` | `tenants` |
| 6 | L1 | `public.connectors` | +150 | 10 | `id` | `tenants` |
| 7 | L1 | `public.parties` | +150 | 28 | `id` | `tenants` |
| 8 | L1 | `public.fuel_indices` | +150 | 7 | `id` | `tenants`, `parties` |
| 9 | L1 | `public.vehicles` | +150 | 14 | `id` | `tenants` |
| 10 | L1 | `public.drivers` | +150 | 13 | `id` | `tenants` |
| 11 | L1 | `public.products` | +150 | 30 | `id` | `tenants` |
| 12 | L1 | `public.service_catalog` | +150 | 12 | `id` | `tenants` |
| 13 | L2 | `public.local_storage_imports` | +150 | 11 | `id` | `tenants` |
| 14 | L2 | `public.tariff_zone_members` | +150 | 12 | `id` | `tenants`, `tariff_zones` |
| 15 | L2 | `public.tariff_headers` | +150 | 22 | `id` | `tenants`, `service_catalog` |
| 16 | L2 | `public.connector_events` | +150 | 11 | `id` | `tenants`, `connectors` |
| 17 | L2 | `public.customs_messages` | +150 | 14 | `id` | `tenants`, `customs_cases` |
| 18 | L2 | `public.customs_events` | +150 | 7 | `(id / case_id)` | `tenants`, `customs_cases` |
| 19 | L2 | `public.communications` | +150 | 16 | `id` | `tenants`, `parties` |
| 20 | L2 | `public.party_contacts` | +150 | 17 | `id` | `tenants`, `parties` |
| 21 | L2 | `public.party_addresses` | +150 | 24 | `id` | `tenants`, `parties` |
| 22 | L2 | `public.party_adr_profiles` | +150 | 7 | `party_id` | `tenants`, `parties` |
| 23 | L2 | `public.customer_billing_profiles` | +150 | 14 | `party_id` | `tenants`, `parties` |
| 24 | L2 | `public.customer_blocks` | +150 | 11 | `id` | `tenants`, `parties` |
| 25 | L2 | `public.carrier_profiles` | +150 | 13 | `party_id` | `tenants`, `parties` |
| 26 | L2 | `public.fuel_index_values` | +150 | 7 | `id` | `tenants`, `fuel_indices` |
| 27 | L2 | `public.fuel_index_bands` | +150 | 10 | `id` | `tenants`, `fuel_indices` |
| 28 | L2 | `public.product_packagings` | +150 | 19 | `id` | `tenants`, `products` |
| 29 | L2 | `public.warehouses` | +150 | 10 | `id` | `tenants`, `party_addresses` |
| 30 | L2 | `public.warehouse_zones` | +150 | 10 | `id` | `tenants`, `warehouses` |
| 31 | L3 | `public.companies` | +150 | 14 | `id` | `tenants`, `party_addresses` |
| 32 | L3 | `public.party_roles` | +150 | 11 | `id` | `tenants`, `parties`, `companies` |
| 33 | L3 | `public.party_services` | +150 | 14 | `id` | `tenants`, `parties`, `service_catalog` |
| 34 | L3 | `public.address_operational_profiles` | +150 | 18 | `address_id` | `tenants`, `party_addresses` |
| 35 | L3 | `public.party_address_assignments` | +150 | 11 | `id` | `tenants`, `parties`, `party_addresses` |
| 36 | L3 | `public.warehouse_bins` | +150 | 18 | `id` | `tenants`, `warehouse_zones` |
| 37 | L3 | `public.tariff_lines` | +150 | 16 | `id` | `tenants`, `tariff_headers`, `tariff_zones` |
| 38 | L3 | `public.tariff_assignments` | +150 | 6 | `id` | `tenants`, `tariff_headers`, `parties` |
| 39 | L3 | `public.tariff_rules` | +150 | 14 | `id` | `tenants`, `tariff_headers` |
| 40 | L3 | `public.transit_times` | +150 | 14 | `id` | `tenants`, `service_catalog`, `party_addresses` |
| 41 | L3 | `public.external_service_mappings` | +150 | 12 | `id` | `tenants`, `parties`, `service_catalog` |
| 42 | L3 | `public.pricing_runs` | +150 | 18 | `id` | `tenants`, `parties`, `tariff_headers`, `service_catalog` |
| 43 | L3 | `public.offers` | +150 | 21 | `id` | `tenants`, `parties`, `service_catalog`, `party_addresses` |
| 44 | L3 | `public.orders` | +150 | 31 | `id` | `tenants`, `parties`, `service_catalog`, `party_addresses` |
| 45 | L4 | `public.offer_lines` | +150 | 11 | `id` | `tenants`, `offers`, `products` |
| 46 | L4 | `public.order_lines` | +150 | 14 | `id` | `tenants`, `orders`, `products` |
| 47 | L4 | `public.delivery_notes` | +150 | 19 | `id` | `tenants`, `orders`, `parties`, `party_addresses` |
| 48 | L4 | `public.expeditions` | +150 | 14 | `id` | `tenants`, `orders`, `service_catalog`, `party_addresses` |
| 49 | L4 | `public.order_hazmat_assessments` | +150 | 11 | `id` | `tenants`, `orders` (estado EXEMPT) |
| 50 | L4 | `public.inventory_quants` | +150 | 16 | `id` | `tenants`, `warehouses`, `warehouse_bins`, `products` |
| 51 | L5 | `public.pricing_run_components` | +150 | 13 | `id` | `tenants`, `pricing_runs` |
| 52 | L5 | `public.delivery_note_lines` | +150 | 10 | `id` | `tenants`, `delivery_notes`, `order_lines`, `products` |
| 53 | L5 | `public.expedition_delivery_notes` | +150 | 5 | `id` | `tenants`, `expeditions`, `delivery_notes` |
| 54 | L5 | `public.inventory_movements` | +150 | 24 | `id` | `tenants`, `products`, `warehouse_bins`, `orders`, `delivery_notes` |
| 55 | L5 | `public.trips` | +150 | 15 | `id` | `tenants`, `vehicles`, `drivers` |
| 56 | L6 | `public.trip_expeditions` | +150 | 6 | `id` | `tenants`, `trips`, `expeditions` |
| 57 | L6 | `public.trip_stops` | +150 | 21 | `id` | `tenants`, `trips`, `party_addresses` |
| 58 | L7 | `public.trip_stop_delivery_notes` | +150 | 6 | `id` | `tenants`, `trip_stops`, `delivery_notes` |
| 59 | L7 | `public.trip_hazmat_assessments` | +150 | 11 | `id` | `tenants`, `trips`, `trip_stops` (estado EXEMPT) |
| 60 | L7 | `public.cmr_documents` | +150 | 44 | `id` | `tenants`, `trips`, `expeditions`, `parties`, `party_addresses` |
| 61 | L7 | `public.transport_stops` | +150 | 20 | `id` | `tenants`, `cmr_documents`, `trip_stops`, `party_addresses` |
| 62 | L8 | `public.cmr_clauses` | +150 | 8 | `id` | `cmr_documents` |
| 63 | L8 | `public.cmr_attachments` | +150 | 9 | `id` | `cmr_documents` |
| 64 | L8 | `public.cmr_parties` | +150 | 15 | `id` | `cmr_documents` |
| 65 | L8 | `public.cmr_goods_lines` | +150 | 24 | `id` | `cmr_documents`, `order_lines` |
| 66 | L8 | `public.cmr_expeditions` | +150 | 5 | `(cmr_id, expedition_id)` | `cmr_documents`, `expeditions` |
| 67 | L8 | `public.transport_events` | +150 | 12 | `id` | `tenants`, `cmr_documents`, `transport_stops` |
| 68 | L8 | `public.cmr_signatures` | +150 | 16 | `id` | `cmr_documents`, `transport_stops` |
| 69 | L8 | `public.transport_evidence` | +150 | 10 | `id` | `tenants`, `cmr_documents`, `transport_stops`, `transport_events` |
| 70 | L8 | `public.regulatory_document_artifacts` | +150 | 16 | `id` | `tenants`, `cmr_documents` |

---

## 7. Políticas de Datos Sintéticos y Seguridad
1. **Identificadores y Trazabilidad:** Todas las filas generadas portan el marcador inequívoco `[PRUEBA]` y trazabilidad con `batch_id: 'DATA150-PRODUCTION-20261009'`.
2. **Puntos de Dirección Logística (150 distintos):**
   - 150 combinaciones únicas y sintéticas de prueba de vía, municipio, código postal de 5 dígitos, provincia, país `ES`, coordenadas geográficas WGS84, horarios operativos y persona de contacto simulada.
   - Preservación íntegra de las 150 direcciones previas del tenant sin sobreescritura de datos ajenos.
3. **Privacidad de Contactos:**
   - Cero números de teléfono generados; los campos `phone` y `contact_phone` quedan fijados en `NULL` para erradicar cualquier riesgo de colisión con números asignados reales.
   - Correos electrónicos asignados exclusivamente bajo el dominio RFC 2606 no enrutable `@fornexatest.invalid`.
4. **Conectores Inertes (`connectors`):**
   - Estado fijado estrictamente en `'DISABLED'` con configuración inerte (`inert: true, mock: true`). Prohibido estado `'ACTIVE'` para prevenir cualquier intento de conexión externa, sincronización o emisión de tráfico.
5. **Artefactos Regulatorios en Cuarentena (`regulatory_document_artifacts`):**
   - Excluidos de la carga sintética y clasificados en cuarentena formal junto con firmas y evidencias. Los consumidores operativos (`lib/regulatory-documents.ts:84-92`) consultan esta tabla sin discriminar `metadata.unissued`, por lo que registrar filas sin ficheros reales en almacenamiento provocaría errores de runtime o descargas rotas. Sujeto a decisión de Fran.
6. **Retorno Efectivo de INSERT (`RETURNING`) y Recibo Real de Ejecución:**
   - Inserciones estructuradas con `RETURNING <pk>` (y `RETURNING id, entity_code` / `id, case_id` en tablas con identidad), garantizando que PostgreSQL devuelve única y exclusivamente las filas insertadas efectivamente por este lote.
   - Se erradica la dependencia de `SELECT` posterior, asegurando que ante cualquier colisión o conflicto, únicamente las filas propias se registran en el recibo de ejecución real (`docs/verification/data150-execution-receipt.json`).
7. **Mecanismo de Rollback Dinámico y Vinculación a Propiedad Efectiva (Fail-Closed Total):**
   - El procedimiento operativo vinculante exige generar el rollback dinámicamente (`scripts/data150/generate_rollback_from_receipt.ts`) consumiendo única y exclusivamente las claves registradas en el recibo de ejecución real (`docs/verification/data150-execution-receipt.json`).
   - El generador valida estrictamente que el recibo esté en estado `COMMITTED`, con `batch_id` y `tenant_id` idénticos a los del lote autorizado, timestamp válido y estructura coherente de claves. Rechaza en fail-closed estados `PENDING_EXECUTION`, `IN_TRANSACTION_PRE_COMMIT`, `TRANSACTION_ABORTED_ROLLED_BACK`, `COMMIT_INDETERMINATE` o estructuras corruptas.
   - El archivo estático `scripts/data150/data150-rollback.sql` ha sido despojado de cualquier sentencia ejecutable con claves previstas y sustituido por un stub fail-closed que aborta inmediatamente (`RAISE EXCEPTION`) si se intenta ejecutar antes de la generación dinámica confirmada.
   - Si una fila preexistente colisionó en la inserción, fue omitida por `ON CONFLICT DO NOTHING`, no fue devuelta por `RETURNING`, no figura en el recibo y por ende es preservada al 100% durante el rollback inverso (Capa 8 a Capa 1).
8. **Alcance y Bloqueo Fail-Closed:**
   - El perímetro efectivo del lote cubre 70 tablas ($70 \times 150 = 10.500$ registros). Incorporadas las 3 tablas regulatorias (`cmr_signatures`, `transport_evidence`, `regulatory_document_artifacts`) con 150 filas sintéticas cada una según la decisión formal de Fran (Opción B). Cero escrituras en base de datos productiva hasta resolución de gates y verificación exhaustiva.
9. **Ciclo de Vida de Transacción y Persistencia Atómica Durable:**
   - `lib/data150-loader.ts` implementa persistencia durable atómica con `fsync` (`writeJsonAtomicallyWithFsync`) escribiendo a fichero temporal, ejecutando `fsync` del buffer de disco y reemplazando atómicamente mediante `rename(2)`, previniendo truncados o lecturas parciales ante caídas.
   - Se discrimina estrictamente el ciclo transaccional: fallo pre-commit (dispara `ROLLBACK;` y marca `TRANSACTION_ABORTED_ROLLED_BACK` o `TRANSACTION_ABORT_ROLLBACK_FAILED`), fallo durante `COMMIT;` (marca `COMMIT_INDETERMINATE` preservando claves devueltas para recuperación sin asumir aborto falso) y fallo post-commit en disco (marca `COMMIT_CONFIRMED_POST_COMMIT_WRITE_FAILED` sin emitir `ROLLBACK;` espurio en transacción ya comprometida).
10. **Estado de Ensayos y Autorización de PostgreSQL Local Temporal:**
   - La lógica de parsing (10.500 sentencias completas sin pérdida de cabeceras), RETURNING, captura pre-commit durable, fsync atómico, tolerancia a fallos y reversión inversa se encuentra verificada mediante batería unitaria y simulación unitaria en memoria (`scripts/data150/run_non_productive_trial.ts`).
   - Fran ha autorizado oficialmente la preparación de un entorno PostgreSQL LOCAL temporal oficial, sin coste y SIN conexión a Supabase/producción.

---

## 11. Invariante de Inmutabilidad Append-Only y Guardas de Cascada (SQLSTATE 55000)

1. **Guardas de Mutación Inmutable:**
   - Migración `20260903003000_t1_append_only_events.sql` instala la función trigger `public.fornexa_reject_event_mutation()` y triggers `transport_events_reject_mutation` y `operational_events_reject_mutation` sobre las tablas `public.transport_events` y `public.operational_events`.
   - Cualquier sentencia `UPDATE` o `DELETE` arroja de forma inmediata e incondicional la excepción:
     ```sql
     ERROR: 55000: FORNEXA event history is append-only; use a compensating event instead
     ```
   - Este bloqueo es efectivo incluso para el superusuario `postgres` y no debe ser desactivado bajo ninguna circunstancia.

2. **Bloqueo de Cascada en Documentos y Paradas:**
   - `public.transport_events` declara claves foráneas hacia `public.cmr_documents(id)` y `public.transport_stops(id)` con regla `ON DELETE CASCADE`.
   - Por diseño intencionado de FORNEXA, una vez emitidos eventos históricos para un documento CMR o una parada, cualquier intento de eliminación física de la entidad padre dispara en cascada la eliminación de eventos, activando el trigger y abortando con SQLSTATE `55000`.
   - La cancelación o corrección de negocio se modela obligatoriamente mediante estados compensatorios y nuevos eventos, nunca mediante borrado físico de la historia.

3. **Inexistencia de Rollback Universal:**
   - Queda formalmente descartada cualquier promesa de rollback universal: las 150 filas sintéticas de eventos en `transport_events` y `operational_events`, junto a sus entidades padre ancladas (`cmr_documents`, `transport_stops`), permanecen de manera permanente como trazabilidad inmutable.
   - El generador de rollback dinámico (`scripts/data150/generate_rollback_from_receipt.ts`) excluye explícitamente estas 4 tablas de cualquier sentencia `DELETE`, preservando intacta la auditoría y permitiendo la reversión limpia y atómica de las 66 tablas mutables restantes.

---

## 12. Evidencia del Ensayo en PostgreSQL 17.11 Local Real (`data150_trial`)

1. **Target y Conexión Aislada:**
   - Motor: PostgreSQL 17.11 (Postgres.app) local en socket Unix dedicado (variables `PGHOST` / `PGPORT`), base de datos aislada `data150_trial`. Cero conexión a producción ni a Supabase.

2. **Replay de Migraciones, Stubs de Emulación, Acreditación de Catálogo y Límites de Equivalencia:**
   - **Orden Cronológico y Semántico de Migraciones:**
     * Aplicadas las 38 migraciones del repositorio en orden de timestamp (`20260807_customs_core.sql` hasta `20261009090000_traceability_lookup_indexes.sql`).
     * **Ordenación Auxiliar Custom (20260819):** Las tres migraciones con prefijo `20260819` se ordenan explícitamente (`20260819_harden_tenant_access_function.sql` -> `20260819_review_access_token_registry.sql` -> `20260819_harden_review_token_rpc.sql`) para respetar las dependencias entre funciones PL/pgSQL y tablas de registro de tokens.
     * **Modificación Auxiliar de Replay (Customs):** En PostgreSQL vanilla local, `20260807_customs_core.sql` crea inicialmente `customs_messages` y `customs_events` sin `tenant_id`. Debido a que `20260812_fornexa_operational_core.sql` utiliza `CREATE TABLE IF NOT EXISTS`, la columna `tenant_id` se omite en el replay directo si la tabla preexiste. El runner aplica un `ALTER TABLE IF EXISTS ... ADD COLUMN IF NOT EXISTS tenant_id uuid` previo a 20260812 para equiparar la estructura real con el catálogo productivo de Supabase.
   - **Acreditación Rigurosa de Catálogo de Base de Datos (Inspección Directa de Catálogo en Vivo):**
     * `information_schema.tables`: 89 tablas base creadas en esquema `public`, conciliadas al 100% con `DATA150-SCHEMA-BASELINE.json`.
     * `information_schema.columns`: 1214 columnas totales creadas en el catálogo de esquema `public` (de las cuales 993 columnas corresponden a las 70 tablas del lote de negocio).
     * `pg_constraint`: 235 restricciones de clave foránea en schema `public` (196 de ellas correspondientes a las 70 tablas de negocio), 89 claves primarias (`contype = 'p'`), 61 restricciones de unicidad (`contype = 'u'`) y 171 restricciones de comprobación (`contype = 'c'`).
     * Cobertura de campos: 100% de los campos obligatorios poblados con valores sintéticos conformes. Campos opcionales (NULL o con default) justificados con estricta semántica de negocio (ej. `phone` fijado en NULL por privacidad RFC 2606, `deleted_at` nulo por ser registros activos no eliminados, timestamps de cierre ausentes en entidades en curso).
   - **Stubs Auxiliares Locales Declarados:**
     * En Supabase gestionado, los esquemas `auth`, `storage` y la extensión `pgcrypto` en `extensions` son gestionados internamente por la plataforma con hooks y servicios propietarios.
     * Para replay en PostgreSQL vanilla local aislado, se inyectaron stubs mínimos sin alterar los archivos de migración:
       - `CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);`
       - `CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;`
       - `CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text; $$;`
       - `CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]); CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), last_accessed_at timestamptz DEFAULT now(), metadata jsonb, path_tokens text[]);`
       - `CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;`
       - Roles emulados: `postgres`, `anon`, `authenticated`, `service_role`.
   - **Límites de Equivalencia Explícitos (Vanilla Local PostgreSQL vs Supabase Gestionado Productivo):**
     * El ensayo local sobre PostgreSQL 17.11 acredita con fidelidad total la lógica relacional: integridad referencial de claves foráneas, disparadores trigger (`55000`), bloqueos concurrentes (`55P03`), transacciones atómicas con RETURNING y rollback topológico inverso.
     * **Límites conocidos no emulados:** El entorno vanilla local NO incluye los componentes propietarios de Supabase (GoTrue Auth API, Realtime CDC WebSockets, Storage REST/S3 gateway, Kong API Gateway ni políticas RLS evaluadas contra claims JWT reales emitidos en producción).
     * Por consiguiente, la superación del ensayo local demuestra la corrección algorítmica y relacional del lote y del rollback dinámico, pero no reemplaza las validaciones previas en staging/canary ni autoriza saltarse los gates de seguridad.

3. **Prueba de Colisión Real y Retorno Efectivo de INSERT (Fase 1 & 2):**
   - Inyección previa de fixtures humanas y ajenas con captura de snapshots completos pre-carga:
     * Fila no colisionante FORNEXA: `party_addresses` con ID `00000000-0000-4000-a000-000000000001`.
     * Fila colisionante FORNEXA: `party_addresses` con ID `52f69594-6c37-58e4-b677-8e2ee752764f` (`Plataforma Humana Previa S.L.`, código `ADDR-PREEXISTING-COLLISION`).
     * Empresa colisionante FORNEXA: `parties` con ID `c9f0d7f6-4453-530f-8dba-0c9ce2426a83` (`Fornexa Carrier Base 000`, código `TER-PRV-0000`).
     * Fixtures de tenant ajeno: `parties` y `party_addresses` bajo tenant `99999999-9999-4999-8999-999999999999`.
   - Al ejecutar el lote de 10.500 INSERTs con RETURNING en transacción atómica:
     * Sentencias colisionantes ejecutan `ON CONFLICT ("id") DO NOTHING` devolviendo `INSERT 0 0` (0 filas retornadas).
     * `party_addresses` captura exactamente 149 claves (excluyendo la fila humana previa).
     * `parties` captura exactamente 149 claves (excluyendo la empresa previa).
     * Las 68 tablas restantes capturan 150 claves cada una. Total filas capturadas por RETURNING: 10.498.
   - **Aislamiento y Versionado de Recibos:**
     * **Recibo de Ensayo Versionado (`COMMITTED`):** El recibo efectivo de la ejecución local en PostgreSQL 17.11 se encuentra versionado y auditado en `docs/verification/data150-rehearsal-execution-receipt.json` (SHA-256: `5692d819e442d99cae74f89477861306258a1b90bce876423ae03c02e4aa0235`), reflejando el estado real post-ensayo con 10.498 claves capturadas y 2 colisiones deliberadas excluidas.
     * **Plantilla de Ejecución Productiva (`PENDING_EXECUTION`):** El archivo `docs/verification/data150-execution-receipt.json` permanece inmutable en estado `PENDING_EXECUTION` a la espera de la ejecución futura en el entorno final.

4. **Reejecución Idempotente (Fase 3):**
   - Segunda ejecución del lote completo sobre PostgreSQL: 0 filas nuevas devueltas por RETURNING. 100% de filas existentes preservadas sin mutación ni duplicados (0.63s).

5. **Concurrencia Multi-Sesión y Aserción Estricta de Bloqueo (Fase 4):**
   - Sesión 1 adquiere bloqueo exclusivo sobre fila preexistente (`SELECT id FROM public.party_addresses WHERE id = '52f69594-...' FOR UPDATE;`).
   - Sesión 2 ejecuta simultáneamente `SELECT id FROM public.party_addresses WHERE id = '52f69594-...' FOR UPDATE NOWAIT;`.
   - Sesión 2 detecta bloqueo inmediato y arroja error estricto `55P03` (`could not obtain lock on row`).
   - Sesión 2 aborta limpiamente (`ROLLBACK`) y Sesión 1 compromete (`COMMIT`). Aislamiento transaccional verificado.

6. **Verificación Rigurosa de Triggers Append-Only (Fase 5):**
   - `DELETE` sobre `public.transport_events` bloqueado con SQLSTATE `55000` (`append-only`).
   - `UPDATE` sobre `public.transport_events` bloqueado con SQLSTATE `55000` (`append-only`).
   - `DELETE` sobre `public.operational_events` bloqueado con SQLSTATE `55000` (`append-only`).
   - `DELETE` sobre `public.cmr_documents` bloqueado con SQLSTATE `55000` por cascada hacia eventos inmutables.
   - `DELETE` sobre `public.transport_stops` bloqueado con SQLSTATE `55000` por cascada hacia eventos inmutables.

7. **Generación de Rollback y Verificación Exhaustiva en 70 Tablas (Fase 6, 7 & 8):**
   - Rollback dinámico generado estrictamente desde el recibo de ejecución confirmado:
     * Excluye al 100% las tablas append-only (`transport_events`, `operational_events`) y protegidas por cascada (`cmr_documents`, `transport_stops`).
     * Excluye al 100% las claves preexistentes colisionadas (`party_addresses`, `parties`).
   - Ejecución transaccional del script inverso sobre tablas mutables en PostgreSQL (código 0).
   - **Verificación Automatizada Columna por Columna de Fixtures:**
     * Fila no colisionante `party_addresses`: 100% de todas sus columnas idénticas pre vs post.
     * Fila colisionada `party_addresses` (`Plataforma Humana Previa S.L.`): 100% de todas sus columnas idénticas pre vs post.
     * Empresa colisionada `parties` (`Fornexa Carrier Base 000`): 100% de todas sus columnas idénticas pre vs post.
     * Fila de tenant ajeno y empresa ajena: 100% de todas sus columnas idénticas pre vs post.
   - **Verificación de Entidades Retenidas:**
     * `transport_events`: 150 registros append-only 100% idénticos conservados.
     * `operational_events`: 150 registros append-only 100% idénticos conservados.
     * `cmr_documents`: 150 documentos protegidos por cascada conservados con su identidad y atributos intactos. Las claves foráneas hacia viajes y expediciones eliminados fueron nulificadas conforme a la regla de catálogo `ON DELETE SET NULL`.
     * `transport_stops`: 150 paradas de transporte conservadas con sus claves e identidad intactas, y FKs dependientes nulificadas por `ON DELETE SET NULL`.
   - **Verificación Completa de las 70 Tablas y Claves Compuestas:**
     * Todas las 66 tablas mutables verificadas con 0 filas restantes mediante consultas que evalúan la totalidad de claves primarias (incluyendo todas las 150 tuplas compuestas de `cmr_expeditions` con `WHERE (cmr_id, expedition_id) IN (...)`).

---

## 13. Bloqueo Fail-Closed y Estado de Gates

- **Cero escrituras en producción:** No se ha ejecutado ninguna sentencia DDL ni DML contra Supabase productivo (`gqkjqhpmyejmehbuombk`).
- **Cero merge y deploy:** La rama `data150/synthetic-production-batch` permanece local en `/tmp/fornexa-gemini-data150`.
- **Excepciones de negocio:** Las tablas regulatorias (`cmr_signatures`, `transport_evidence`, `regulatory_document_artifacts`) continúan en cuarentena estricta a la espera de la decisión única de Fran.
- **Condición de Pase a Producción:** Ninguna afirmación de "100% en ensayo local" equivale a pase productivo. La carga en producción requiere resolución previa de las excepciones regulatorias por Fran, aprobación unánime de los revisores independientes (Claude y DeepSeek) sobre el exact-HEAD con 0 MUSTs y MERGE: YES, y CI en verde.
