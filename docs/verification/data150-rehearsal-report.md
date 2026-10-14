# FORNEXA — Reporte Exhaustivo del Ensayo Local en PostgreSQL 17.11 (DATA150-M5)

**Identificador de Tarea:** `DATA150-CLOSE-20261014`  
**Pull Request:** #103 (`fragonh2-boop/Fornexa`)  
**Rama:** `data150/synthetic-production-batch`  
**Entorno de Ensayo:** PostgreSQL 17.11 (Postgres.app) on `aarch64-apple-darwin23.6.0`, socket `/private/tmp/data150-pg-CUM6hE:55439`, base de datos `data150_trial`  
**Fecha de Ejecución:** 2026-10-14 13:37:53 UTC – 13:38:01 UTC  
**Código de Salida:** 0 (SUCCESS en las 8 fases)  

---

## 1. Resumen Ejecutivo y Procedencia

El ensayo local en PostgreSQL 17.11 vivo acredita de forma reproducible y exhaustiva la validez técnica, transaccional, criptográfica y regulatoria del lote sintético `DATA150-PRODUCTION-20261009` sobre el PR #103.

El ensayo se ejecutó de forma íntegra mediante el arnés automatizado `scripts/data150/run_local_pg_rehearsal.py`, cubriendo 8 fases secuenciales sin saltos ni dependencias externas mockeadas.

> **Nota de Procedencia y Trazabilidad del Ensayo (SHOULD 2):**  
> El archivo de log versionado `docs/verification/data150-local-pg-rehearsal.log` registra la ejecución en vivo y reproducible completada con éxito (Exit Code 0) en PostgreSQL 17.11 sobre el commit base `40bb9ad20a11c5f53f5cf281f4fd4bff00f5e7aa` con las adaptaciones de código de ensayo en working tree (`234baa178759ce133553504f744d18e78c0c8cf248b5c8984eaef6909dff2102` previo al commit `20d1b90`). Los artefactos de salida congelados (`data150-rehearsal-execution-receipt.json`, `data150-rehearsal-rollback.sql`) y las evidencias de contabilidad corresponden estrictamente a dicha ejecución viva, preservando fidelidad histórica sin ejecuciones artificiales posteriores ni repetición innecesaria del ensayo.

### Artefactos y Hashes Criptográficos Verificables (SHA-256)

| Artefacto | Ruta | Hash SHA-256 |
|---|---|---|
| **SQL Loader** | `scripts/data150/data150-loader.sql` | `28996cacc2535155669e1107f07d8b8bceebfb272d52ce893c6bcc176d9a8a77` |
| **Manifiesto JCS** | `docs/verification/data150-manifest-20261009.json` | `bcc6334345b3cf2f916d6deb9f3fd7ac7efec1fbd361fdfb957702032b358084` |
| **Dataset Merkle Root** | Raíz Merkle de las 10.500 filas | `228380fa9b7fd96b9ab6e919d2eee3a13bd3c5063713bc7ddb29eab8dc9a201d` |
| **Recibo de Ejecución Real** | `docs/verification/data150-rehearsal-execution-receipt.json` | `5692d819e442d99cae74f89477861306258a1b90bce876423ae03c02e4aa0235` |
| **Rollback Materializado** | `docs/verification/data150-rehearsal-rollback.sql` | `88ac89a290a4d48612d67802793c43e521ead24a34d688b25818e37bd1b12a57` |
| **Schema Baseline Prod** | `docs/verification/data150-schema-baseline.json` | `2e6356d0575d1adc9f1067224485ce9f80b8f3bdb8a6da4101d4a1b5a0d6b6ed` |
| **Canonical Reference Local**| `docs/verification/data150-schema-canonical-reference.json` | `26d880e1592a3405e2b05c647e383fb4cc95e7ab68439b8588ade28cd4afbcd9` |

---

## 2. Reconciliación de Filas: 10.498 Efectivas vs 10.500 Totales (Diferencia Explicada)

El lote consta de 10.500 sentencias `INSERT` distribuidas equitativamente en 70 tablas (150 filas por tabla).

Durante el ensayo en PostgreSQL 17.11 vivo:
1. En la **FASE 1**, se pre-sembraron intencionadamente fixtures de colisión real para someter a prueba la cláusula `ON CONFLICT ("id") DO NOTHING RETURNING "id"`:
   - Fila en `parties` con ID `c9f0d7f6-4453-530f-8dba-0c9ce2426a83`.
   - Fila en `party_addresses` con ID `52f69594-6c37-58e4-b677-8e2ee752764f`.
2. Al ejecutar el cargador en la **FASE 2**:
   - En `parties`, 149 filas fueron efectivamente insertadas y 1 colisionó contra la preexistente (`INSERT 0 0`). La cláusula `RETURNING` devolvió exactamente 149 IDs.
   - En `party_addresses`, 149 filas fueron efectivamente insertadas y 1 colisionó contra la preexistente (`INSERT 0 0`). La cláusula `RETURNING` devolvió exactamente 149 IDs.
   - En las restantes 68 tablas, las cláusulas `RETURNING` devolvieron 150 IDs por tabla.
3. **Total de filas capturadas en el recibo:**
   $$\text{Total RETURNING} = (68 \times 150) + 149 + 149 = 10.200 + 298 = 10.498 \text{ filas}$$
4. **Preservación de colisiones:**
   - Las 2 filas preexistentes no sufrieron mutación alguna (100% columnas intactas).
   - Al no ser devueltas por `RETURNING`, quedaron **estrictamente excluidas** del recibo `data150-rehearsal-execution-receipt.json` y, consecuentemente, del script de rollback `data150-rehearsal-rollback.sql`.
   - Tras el rollback, ambas filas preexistentes permanecieron en la base de datos sin alteración.

---

## 3. Rollback Materializado y Reproducible

El script de rollback materializado `docs/verification/data150-rehearsal-rollback.sql` (401 KB, 66 sentencias `DELETE`) es generado de forma determinista mediante `scripts/data150/generate_rollback_from_receipt.ts`:
- **Determinismo estricto:** Mismo recibo de entrada $\to$ Mismo SQL de salida byte a byte (SHA-256: `88ac89a290a4d48612d67802793c43e521ead24a34d688b25818e37bd1b12a57`).
- **Orden topológico inverso:** Borra en orden inverso estricto a las dependencias de claves foráneas (tablas hijas/hojas antes que tablas padres/raíz), evitando violaciones de integridad referencial.
- **Ámbito estricto por tenant:** Cada sentencia `DELETE` incluye la cláusula `AND tenant_id = '00000000-0000-4000-8000-000000000001'` o, en tablas de unión sin columna directa de tenant, subconsultas de comprobación sobre el documento padre (`cmr_id IN (SELECT id FROM public.cmr_documents WHERE tenant_id = '...')`).
- **Cero borrados especulativos:** Solo borra las claves exactas registradas en el recibo COMMITTED.

---

## 4. Preservación del Guard Append-Only y Contabilidad de Residuales

El ensayo acredita el cumplimiento riguroso de las restricciones normativas y de auditoría de la plataforma Fornexa:

### 4.1. Tablas Inmutables de Auditoría (`transport_events` y `operational_events`)
- Ambas tablas cuentan con el trigger `fornexa_reject_event_mutation` que bloquea taxativamente `UPDATE` y `DELETE` con `SQLSTATE 55000`.
- En la FASE 5, se verificó en vivo que cualquier intento de `DELETE` o `UPDATE` en PostgreSQL es rechazado con error `55000`.
- El generador de rollback **omite intencionadamente** sentencias `DELETE` para estas dos tablas, insertando la marca:
  `-- [IMMUTABLE AUDIT TABLE] Table public.transport_events is protected by append-only trigger (55000). Rows are preserved as permanent audit trail.`
- **Residual post-rollback:** 150 registros en `transport_events` y 150 registros en `operational_events` permanecen intactos como pista de auditoría inmutable.

### 4.2. Tablas Protegidas por Cascada (`cmr_documents` y `transport_stops`)
- `cmr_documents` y `transport_stops` son entidades padre referenciadas por `transport_events`.
- Intentar ejecutar `DELETE` sobre ellas provocaría que PostgreSQL intentase borrar en cascada los registros de `transport_events`, activando el trigger `55000` y abortando la transacción entera.
- Por diseño arquitectónico fail-closed, el generador de rollback **omite sentencias DELETE** para ambas tablas:
  `-- [CASCADE PROTECTED TABLE] Table public.cmr_documents contains foreign keys referenced by immutable transport_events.`
- Las relaciones a padres eliminados (`trip_record_id`, `expedition_record_id`, `trip_stop_id`) se resuelven limpiamente mediante la regla contractual del esquema `ON DELETE SET NULL`, verificándose en la FASE 8 que todos los punteros a registros eliminados quedaron a `NULL` sin corromper la identidad de los documentos.
- **Residual post-rollback:** 150 registros en `cmr_documents` y 150 registros en `transport_stops`.

### 4.3. Tablas Mutables Limpias (66 tablas restantes)
- Las 66 tablas mutables (70 tablas totales menos las 4 tablas residuales: 2 inmutables append-only y 2 protegidas por cascada) fueron vaciadas al 100% de registros del lote sintético tras la ejecución del rollback (0 registros remanentes).

---

## 5. Declaración de Binarios Locales vs Cero Objetos en Storage Remoto

En cumplimiento de las directivas de seguridad y contención de costes:
- **Artefactos binarios generados localmente:** Los archivos PDF y JPEG sintéticos generados para validación de firmas y pruebas de impresión residen de forma estrictamente local en el directorio de trabajo `scripts/data150/artifacts/`.
- **Cero objetos en Supabase Storage:** **NO** se ha subido ningún archivo a Supabase Storage remoto.
- **Cero buckets remotos creados:** No se ha provisionado ningún bucket en infraestructura de nube.
- **Cero migraciones nuevas:** No se han añadido columnas ni modificado esquemas de base de datos.
- **Cero secretos o servicios externos:** No se requiere ningún servicio o credencial externa.

---

## 6. Inventario Completo de Tablas: Antes, Durante y Después del Rollback

A continuación se detalla el estado exacto de las 70 tablas involucradas en el ensayo:

| # | Tabla | Categoría | Preexistente | Tras Carga (FASE 2) | Tras Rollback (FASE 8) | Estado Residual |
|---|---|---|---|---|---|---|
| 1 | `tariff_zones` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 2 | `operational_events` | Inmutable Append-Only | 0 | 150 | 150 | 150 (Preservada; Trigger 55000) |
| 3 | `local_storage_sync_runs` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 4 | `external_identifiers` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 5 | `customs_cases` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 6 | `connectors` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 7 | `parties` | Mutable | 1 (colisión) + 1 (ajeno) | 151 (149 nuevas) | 2 (preexistentes intactas) | Limpio (0 sintéticas) |
| 8 | `fuel_indices` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 9 | `vehicles` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 10 | `drivers` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 11 | `products` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 12 | `service_catalog` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 13 | `local_storage_imports` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 14 | `tariff_zone_members` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 15 | `tariff_headers` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 16 | `connector_events` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 17 | `customs_messages` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 18 | `customs_events` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 19 | `communications` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 20 | `party_contacts` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 21 | `party_addresses` | Mutable | 2 (1 colisión, 1 no) + 1 (ajeno) | 152 (149 nuevas) | 3 (preexistentes intactas) | Limpio (0 sintéticas) |
| 22 | `party_adr_profiles` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 23 | `customer_billing_profiles` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 24 | `customer_blocks` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 25 | `carrier_profiles` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 26 | `fuel_index_values` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 27 | `fuel_index_bands` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 28 | `product_packagings` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 29 | `warehouses` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 30 | `warehouse_zones` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 31 | `companies` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 32 | `party_roles` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 33 | `party_services` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 34 | `address_operational_profiles` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 35 | `party_address_assignments` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 36 | `warehouse_bins` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 37 | `tariff_lines` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 38 | `tariff_assignments` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 39 | `tariff_rules` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 40 | `transit_times` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 41 | `external_service_mappings` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 42 | `pricing_runs` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 43 | `offers` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 44 | `orders` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 45 | `offer_lines` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 46 | `order_lines` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 47 | `delivery_notes` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 48 | `expeditions` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 49 | `order_hazmat_assessments` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 50 | `inventory_quants` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 51 | `pricing_run_components` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 52 | `delivery_note_lines` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 53 | `expedition_delivery_notes` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 54 | `inventory_movements` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 55 | `trips` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 56 | `trip_expeditions` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 57 | `trip_stops` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 58 | `trip_stop_delivery_notes` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 59 | `trip_hazmat_assessments` | Excepcional (Sin marcador) | 0 | 150 | 0 | Limpio (0) |
| 60 | `cmr_documents` | Protegida por Cascada | 0 | 150 | 150 | 150 (Preservada; FKs nullified) |
| 61 | `transport_stops` | Protegida por Cascada | 0 | 150 | 150 | 150 (Preservada; FKs nullified) |
| 62 | `cmr_clauses` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 63 | `cmr_attachments` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 64 | `cmr_parties` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 65 | `cmr_goods_lines` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 66 | `cmr_expeditions` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 67 | `transport_events` | Inmutable Append-Only | 0 | 150 | 150 | 150 (Preservada; Trigger 55000) |
| 68 | `cmr_signatures` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 69 | `transport_evidence` | Mutable | 0 | 150 | 0 | Limpio (0) |
| 70 | `regulatory_document_artifacts` | Mutable | 0 | 150 | 0 | Limpio (0) |

---

## 7. Verificación de Fases del Ensayo (Resumen de Log)

1. **FASE 0:** Aplicación de 38 migraciones con paridad 100% contra `data150-schema-canonical-reference.json` y baseline productivo (89 tablas, 1.214 columnas, 235 FKs, 171 CHECKs, 61 UNIQUEs, 485 DEFAULT/IDENTITY, 37 triggers / 41 eventos vinculados).
2. **FASE 1:** Pre-sembrado de tenant Fornexa, tenant ajeno y 2 colisiones deliberadas (`parties`, `party_addresses`).
3. **FASE 2:** Ejecución atómica de 10.500 sentencias SQL en 1,49s. 10.498 filas devueltas por RETURNING (colisiones devuelven 0 filas). Recibo persistido con fsync.
4. **FASE 3:** Reejecución de prueba (retry idempotente): 0 nuevas filas devueltas (0 duplicados, 0 mutaciones espurias).
5. **FASE 4:** Ensayo concurrente: Sesión 2 bloqueada con error `SQLSTATE 55P03` al intentar lock NOWAIT sobre fila abierta en Sesión 1.
6. **FASE 5:** Triggers append-only probados en vivo: `DELETE` y `UPDATE` en `transport_events` y `operational_events` rechazados activamente con `SQLSTATE 55000`. Intentos de cascada sobre `cmr_documents` y `transport_stops` bloqueados con `55000`.
7. **FASE 5B:** Contrato de actor M1 verificado: tenant sin miembros resuelve a `NULL` de forma válida; miembro real resuelve con precedencia `OWNER > ADMIN`; actor falso es rechazado con `SQLSTATE 23503`.
8. **FASE 6:** Generación de rollback determinista desde el recibo de ejecución real (exclusión explícita de tablas append-only y protegidas por cascada).
9. **FASE 7:** Ejecución transaccional del rollback sobre tablas mutables en PostgreSQL (código 0).
10. **FASE 8:** Verificación exhaustiva: 100% de preexistentes intactas, 100% de tablas mutables limpiadas, residuales explicados y justificados.

---

## 8. Conclusión del Ciclo 3 (M5)

El ensayo en PostgreSQL 17.11 demuestra que el lote sintético `DATA150` satisface plenamente el requisito M5:
- Recibo de ejecución real capturado por `RETURNING`, distinguiendo inequívocamente `INSERTED` de `SKIPPED`.
- Rollback materializado y reproducible generado dinámicamente desde el recibo duradero.
- Aislamiento total de datos preexistentes y ajenos.
- Respeto absoluto al guard append-only de auditoría (55000) sin debilitar las garantías del sistema.
- Cero escrituras a bases remotas, cero subidas a Storage y cero alteraciones de esquema.
