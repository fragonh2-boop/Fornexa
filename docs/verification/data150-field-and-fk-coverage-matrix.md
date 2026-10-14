# FORNEXA — Matriz Detallada de Cobertura por Campo y Claves Foráneas (DATA150)

Fecha: 2026-10-09 | Batch ID: `DATA150-PRODUCTION-20261009` | Tenant: `tenant titular FORNEXA`
Cobertura: **70 tablas de negocio objetivo**, **993 columnas** inventariadas y **196 relaciones de clave foránea** resueltas.

---

## Resumen Estadístico de Cobertura de Campos
- **Total Tablas de Negocio Objetivo:** 70
- **Total Columnas Totales Verificadas:** 993
- **Total Inserciones Sintéticas:** 10,500 filas (150 filas completas y distintas por tabla)
- **Claves Foráneas Salientes:** 196 relaciones íntegramente referenciadas a entidades válidas del lote o catálogos existentes.
- **Columnas Inventadas / Ajenas al Esquema:** 0 (0% desviación)
- **Columnas Obligatorias Omitidas:** 0
- **Mecanismo de Retorno:** `RETURNING <pk>` (captura durable y exclusiva de filas propias)

---

## Capa Topológica L1 (12 tablas)

### 1. `public.tariff_zones`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 7

**Claves Foráneas Salientes:** Ninguna (entidad raíz independiente o sin dependencias externas)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `country` | `character` | SÍ | 1 | Constante funcional (`ES`) |
| `purpose` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 2. `public.operational_events`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `actor_user_id` &rarr; `public.auth.users(id)` (Constraint: `operational_events_actor_user_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `operational_events_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `bigint` | NO | 0 | PK sintética (0 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `entity_type` | `text` | NO | 1 | Constante funcional (`DATA150_BATCH`) |
| `entity_id` | `uuid` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `entity_code` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `event_type` | `text` | NO | 1 | Constante funcional (`SYNTHETIC_BATCH_RECORD`) |
| `actor_user_id` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `source` | `text` | NO | 1 | Constante funcional (`DATA150_SYSTEM`) |
| `occurred_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `data` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 3. `public.local_storage_sync_runs`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `local_storage_sync_runs_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `source_origin` | `text` | NO | 1 | Constante funcional (`DATA150_FIXTURE`) |
| `status` | `text` | NO | 1 | Constante funcional (`COMPLETED`) |
| `storage_keys` | `integer` | NO | 1 | Constante funcional (`1`) |
| `source_items` | `integer` | NO | 1 | Constante funcional (`1`) |
| `normalized_records` | `integer` | NO | 1 | Constante funcional (`1`) |
| `summary` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `error_message` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `started_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `completed_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |

### 4. `public.external_identifiers`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 9

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `external_identifiers_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `system_code` | `text` | NO | 1 | Constante funcional (`ERP_SAP`) |
| `entity_type` | `text` | NO | 1 | Constante funcional (`PARTY`) |
| `canonical_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `external_id` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `company_scope` | `text` | SÍ | 1 | Constante funcional (`FORNEXA`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 5. `public.customs_cases`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 13

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `customs_cases_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `reference` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `country_code` | `character` | NO | 1 | Constante funcional (`ES`) |
| `direction` | `text` | NO | 1 | Constante funcional (`import`) |
| `system` | `text` | NO | 1 | Constante funcional (`HUA`) |
| `status` | `text` | NO | 1 | Constante funcional (`PRESENTADO`) |
| `mrn` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `declarant_eori` | `text` | SÍ | 1 | Constante funcional (`ESB99999999`) |
| `representative_eori` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `payload` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 6. `public.connectors`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 10

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `connectors_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `category` | `text` | NO | 1 | Constante funcional (`TRACKING`) |
| `provider` | `text` | NO | 1 | Constante funcional (`TEST_PROVIDER`) |
| `status` | `text` | NO | 1 | Constante funcional (`DISABLED`) |
| `configuration` | `jsonb` | NO | 1 | Constante funcional (`{'batch': 'DATA150-PRO...`) |
| `last_health_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 7. `public.parties`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 28

**Claves Foráneas Salientes (Integridad Referencial):**
- `account_manager_user_id` &rarr; `public.auth.users(id)` (Constraint: `parties_account_manager_user_id_fkey`)
- `billing_party_id` &rarr; `public.parties(id)` (Constraint: `parties_billing_party_id_fkey`)
- `business_group_party_id` &rarr; `public.parties(id)` (Constraint: `parties_business_group_party_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `parties_tenant_id_fkey`)
- `parent_party_id` &rarr; `public.parties(id)` (Constraint: `parties_parent_party_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `legal_name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `trade_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `tax_id` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `country_code` | `character` | NO | 1 | Constante funcional (`ES`) |
| `language` | `text` | NO | 1 | Constante funcional (`es`) |
| `currency` | `character` | NO | 1 | Constante funcional (`EUR`) |
| `is_customer` | `boolean` | NO | 2 | Distribución de 2 variantes categóricas / numéricas |
| `is_supplier` | `boolean` | NO | 2 | Distribución de 2 variantes categóricas / numéricas |
| `is_carrier` | `boolean` | NO | 2 | Distribución de 2 variantes categóricas / numéricas |
| `is_shipper` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `is_consignee` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `adr_control` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `status` | `text` | NO | 1 | Constante funcional (`ACTIVE`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `eori` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `gln` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `cnae_code` | `text` | SÍ | 1 | Constante funcional (`5229`) |
| `commercial_register` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `business_group_party_id` | `uuid` | SÍ | 0 | FK referenciada a `parties.id` (0 relaciones consistentes) |
| `billing_party_id` | `uuid` | SÍ | 0 | FK referenciada a `parties.id` (0 relaciones consistentes) |
| `account_manager_user_id` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `parent_party_id` | `uuid` | SÍ | 0 | FK referenciada a `parties.id` (0 relaciones consistentes) |
| `tax_id_type` | `text` | SÍ | 1 | Constante funcional (`NIF_IVA`) |

### 8. `public.fuel_indices`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 7

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, party_id` &rarr; `public.parties(tenant_id, id)` (Constraint: `fuel_indices_party_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `party_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `currency` | `character` | NO | 1 | Constante funcional (`EUR`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 9. `public.vehicles`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `vehicles_tenant_id_fkey`)
- `owner_party_id` &rarr; `public.parties(id)` (Constraint: `vehicles_owner_party_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `owner_party_id` | `uuid` | SÍ | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `registration` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `vehicle_type` | `text` | SÍ | 1 | Constante funcional (`TRACTORA`) |
| `capacity_weight` | `numeric` | SÍ | 1 | Constante funcional (`24000.0`) |
| `capacity_volume` | `numeric` | SÍ | 1 | Constante funcional (`85.0`) |
| `adr_enabled` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `status` | `text` | NO | 1 | Constante funcional (`AVAILABLE`) |
| `telematics_provider` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `telematics_external_id` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 10. `public.drivers`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 13

**Claves Foráneas Salientes (Integridad Referencial):**
- `supplier_party_id` &rarr; `public.parties(id)` (Constraint: `drivers_supplier_party_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `drivers_tenant_id_fkey`)
- `user_id` &rarr; `public.auth.users(id)` (Constraint: `drivers_user_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `supplier_party_id` | `uuid` | SÍ | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `user_id` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `phone` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `email` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `licence_number` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `adr_qualified` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `status` | `text` | NO | 1 | Constante funcional (`ACTIVE`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 11. `public.products`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 30

**Claves Foráneas Salientes (Integridad Referencial):**
- `owner_party_id` &rarr; `public.parties(id)` (Constraint: `products_owner_party_id_fkey`)
- `customer_id` &rarr; `public.parties(id)` (Constraint: `products_customer_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `products_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `customer_id` | `uuid` | SÍ | 100 | FK referenciada a `parties.id` (100 relaciones consistentes) |
| `sku` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `hazard_status` | `text` | NO | 1 | Constante funcional (`NON_HAZARDOUS`) |
| `status` | `text` | NO | 1 | Constante funcional (`ACTIVE`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `revision_number` | `integer` | NO | 1 | Constante funcional (`1`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `owner_party_id` | `uuid` | SÍ | 100 | FK referenciada a `parties.id` (100 relaciones consistentes) |
| `description` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `category_code` | `text` | SÍ | 1 | Constante funcional (`GENERAL_CARGO`) |
| `gtin` | `character varying` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `hs_code` | `character varying` | SÍ | 1 | Constante funcional (`84713000`) |
| `uom_base` | `text` | NO | 1 | Constante funcional (`UN`) |
| `net_weight_kg` | `numeric` | SÍ | 1 | Constante funcional (`10.5`) |
| `gross_weight_kg` | `numeric` | SÍ | 1 | Constante funcional (`12.0`) |
| `length_cm` | `numeric` | SÍ | 1 | Constante funcional (`40.0`) |
| `width_cm` | `numeric` | SÍ | 1 | Constante funcional (`30.0`) |
| `height_cm` | `numeric` | SÍ | 1 | Constante funcional (`25.0`) |
| `volume_m3` | `numeric` | SÍ | 1 | Constante funcional (`0.03`) |
| `is_hazardous` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `is_temperature_controlled` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `temp_min_c` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `temp_max_c` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `shelf_life_days` | `integer` | SÍ | 1 | Constante funcional (`365`) |
| `is_batch_managed` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `is_serial_managed` | `boolean` | NO | 1 | Constante funcional (`False`) |

### 12. `public.service_catalog`
- **Capa:** L1
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 12

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `service_catalog_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `description` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `mode` | `text` | NO | 1 | Constante funcional (`ROAD`) |
| `service_type` | `text` | NO | 1 | Constante funcional (`FTL`) |
| `unit` | `text` | SÍ | 1 | Constante funcional (`SHIPMENT`) |
| `is_active` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

## Capa Topológica L2 (18 tablas)

### 13. `public.local_storage_imports`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `local_storage_imports_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `source_origin` | `text` | NO | 1 | Constante funcional (`DATA150_FIXTURE`) |
| `storage_key` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `item_key` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `content_hash` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `payload` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `normalized_entity_type` | `text` | SÍ | 1 | Constante funcional (`PARTY`) |
| `normalized_entity_id` | `uuid` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `first_seen_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `last_synced_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |

### 14. `public.tariff_zone_members`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 12

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, zone_id` &rarr; `public.tariff_zones(tenant_id, id)` (Constraint: `tariff_zone_members_zone_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `zone_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `member_type` | `text` | NO | 1 | Constante funcional (`COUNTRY`) |
| `country` | `character` | NO | 1 | Constante funcional (`ES`) |
| `admin_division_code` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `postal_code` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `postal_range_from` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `postal_range_to` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `postal_prefix` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `excluded` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 15. `public.tariff_headers`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 22

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, destination_zone_id` &rarr; `public.tariff_zones(tenant_id, id)` (Constraint: `tariff_headers_destination_zone_tenant_fk`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `tariff_headers_tenant_id_fkey`)
- `service_id` &rarr; `public.service_catalog(id)` (Constraint: `tariff_headers_service_id_fkey`)
- `superseded_by_id` &rarr; `public.tariff_headers(id)` (Constraint: `tariff_headers_superseded_by_id_fkey`)
- `created_by` &rarr; `public.auth.users(id)` (Constraint: `tariff_headers_created_by_fkey`)
- `approved_by` &rarr; `public.auth.users(id)` (Constraint: `tariff_headers_approved_by_fkey`)
- `tenant_id, origin_zone_id` &rarr; `public.tariff_zones(tenant_id, id)` (Constraint: `tariff_headers_origin_zone_tenant_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `status` | `text` | NO | 1 | Constante funcional (`ACTIVE`) |
| `version` | `integer` | NO | 1 | Constante funcional (`1`) |
| `valid_from` | `date` | NO | 1 | Constante funcional (`2026-01-01`) |
| `valid_to` | `date` | SÍ | 1 | Constante funcional (`2026-12-31`) |
| `currency` | `character` | NO | 1 | Constante funcional (`EUR`) |
| `priority` | `integer` | NO | 1 | Constante funcional (`10`) |
| `service_id` | `uuid` | SÍ | 150 | FK referenciada a `service_catalog.id` (150 relaciones consistentes) |
| `origin_country` | `character` | SÍ | 1 | Constante funcional (`ES`) |
| `destination_country` | `character` | SÍ | 1 | Constante funcional (`ES`) |
| `superseded_by_id` | `uuid` | SÍ | 0 | FK referenciada a `tariff_headers.id` (0 relaciones consistentes) |
| `created_by` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `approved_by` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `approved_at` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `kind` | `text` | NO | 1 | Constante funcional (`SELL`) |
| `origin_zone_id` | `uuid` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `destination_zone_id` | `uuid` | SÍ | 150 | 150 valores sintéticos completos y distintos |

### 16. `public.connector_events`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `connector_id` &rarr; `public.connectors(id)` (Constraint: `connector_events_connector_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `connector_events_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `connector_id` | `uuid` | NO | 150 | FK referenciada a `connectors.id` (150 relaciones consistentes) |
| `direction` | `text` | NO | 1 | Constante funcional (`INBOUND`) |
| `event_type` | `text` | NO | 1 | Constante funcional (`PING`) |
| `status` | `text` | NO | 1 | Constante funcional (`OK`) |
| `external_reference` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `payload` | `jsonb` | NO | 1 | Constante funcional (`{'batch': 'DATA150-PRO...`) |
| `error_message` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `occurred_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 17. `public.customs_messages`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `customs_messages_tenant_id_fkey`)
- `case_id` &rarr; `public.customs_cases(id)` (Constraint: `customs_messages_case_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `case_id` | `uuid` | NO | 150 | FK referenciada a `customs_cases.id` (150 relaciones consistentes) |
| `correlation_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `direction` | `text` | NO | 1 | Constante funcional (`outbound`) |
| `system` | `text` | NO | 1 | Constante funcional (`HUA`) |
| `message_type` | `text` | NO | 1 | Constante funcional (`CC515C`) |
| `environment` | `text` | NO | 1 | Constante funcional (`PRE`) |
| `status` | `text` | NO | 1 | Constante funcional (`SENT`) |
| `xml_payload` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `http_status` | `integer` | SÍ | 1 | Constante funcional (`200`) |
| `error_codes` | `jsonb` | NO | 1 | Constante funcional (`[]`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `processed_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |

### 18. `public.customs_events`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 7

**Claves Foráneas Salientes (Integridad Referencial):**
- `case_id` &rarr; `public.customs_cases(id)` (Constraint: `customs_events_case_id_fkey`)
- `actor_id` &rarr; `public.auth.users(id)` (Constraint: `customs_events_actor_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `customs_events_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `bigint` | NO | 0 | PK sintética (0 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `case_id` | `uuid` | NO | 150 | FK referenciada a `customs_cases.id` (150 relaciones consistentes) |
| `event_type` | `text` | NO | 1 | Constante funcional (`CASE_INITIALIZED`) |
| `actor_id` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `data` | `jsonb` | NO | 1 | Constante funcional (`{'batch': 'DATA150-PRO...`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 19. `public.communications`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 16

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `communications_tenant_id_fkey`)
- `party_id` &rarr; `public.parties(id)` (Constraint: `communications_party_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `channel` | `text` | NO | 1 | Constante funcional (`EMAIL`) |
| `direction` | `text` | NO | 1 | Constante funcional (`OUTBOUND`) |
| `party_id` | `uuid` | SÍ | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `related_entity_type` | `text` | SÍ | 1 | Constante funcional (`ORDER`) |
| `related_entity_id` | `uuid` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `recipient` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `subject` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `provider` | `text` | SÍ | 1 | Constante funcional (`MOCK_MAILER`) |
| `provider_message_id` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `status` | `text` | NO | 1 | Constante funcional (`SENT`) |
| `payload` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `error_message` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `sent_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 20. `public.party_contacts`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 17

**Claves Foráneas Salientes (Integridad Referencial):**
- `party_id` &rarr; `public.parties(id)` (Constraint: `party_contacts_party_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `party_contacts_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `party_id` | `uuid` | NO | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `role` | `text` | SÍ | 1 | Constante funcional (`Responsable Logístico`) |
| `phone` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `email` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `is_primary` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `is_active` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `department` | `text` | SÍ | 1 | Constante funcional (`Operaciones`) |
| `language` | `text` | SÍ | 1 | Constante funcional (`es`) |
| `schedule` | `jsonb` | NO | 1 | Constante funcional (`{'dias': 'L-V', 'horar...`) |
| `notification_channels` | `ARRAY` | NO | 1 | Constante funcional (`['EMAIL']`) |
| `valid_from` | `date` | SÍ | 1 | Constante funcional (`2026-01-01`) |
| `valid_to` | `date` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |

### 21. `public.party_addresses`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 24

**Claves Foráneas Salientes (Integridad Referencial):**
- `party_id` &rarr; `public.parties(id)` (Constraint: `party_addresses_party_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `party_addresses_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `party_id` | `uuid` | NO | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `code` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `address_type` | `text` | NO | 1 | Constante funcional (`OPERATING`) |
| `name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `address_line1` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `address_line2` | `text` | SÍ | 12 | Distribución de 12 variantes categóricas / numéricas |
| `postal_code` | `text` | SÍ | 50 | Distribución de 50 variantes categóricas / numéricas |
| `city` | `text` | NO | 49 | Distribución de 49 variantes categóricas / numéricas |
| `region` | `text` | SÍ | 34 | Distribución de 34 variantes categóricas / numéricas |
| `country_code` | `character` | NO | 1 | Constante funcional (`ES`) |
| `latitude` | `numeric` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `longitude` | `numeric` | SÍ | 101 | Distribución de 101 variantes categóricas / numéricas |
| `contact_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `contact_phone` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `contact_email` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `default_window_start` | `time without time zone` | SÍ | 1 | Constante funcional (`08:00:00`) |
| `default_window_end` | `time without time zone` | SÍ | 1 | Constante funcional (`18:00:00`) |
| `instructions` | `text` | SÍ | 1 | Constante funcional (`Acceso por puerta prin...`) |
| `is_active` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `subdivision_key` | `text` | SÍ | 34 | Distribución de 34 variantes categóricas / numéricas |

### 22. `public.party_adr_profiles`
- **Capa:** L2
- **Clave Primaria:** `party_id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 7

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `party_adr_profiles_tenant_id_fkey`)
- `updated_by` &rarr; `public.auth.users(id)` (Constraint: `party_adr_profiles_updated_by_fkey`)
- `party_id` &rarr; `public.parties(id)` (Constraint: `party_adr_profiles_party_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `party_id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `frequency` | `text` | NO | 1 | Constante funcional (`NEVER`) |
| `validation_policy` | `text` | NO | 1 | Constante funcional (`INFO`) |
| `preferred_classes` | `ARRAY` | NO | 1 | Constante funcional (`[]`) |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_by` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |

### 23. `public.customer_billing_profiles`
- **Capa:** L2
- **Clave Primaria:** `party_id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `party_id` &rarr; `public.parties(id)` (Constraint: `customer_billing_profiles_party_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `customer_billing_profiles_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `party_id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `payment_method` | `text` | SÍ | 1 | Constante funcional (`TRANSFER`) |
| `payment_terms_days` | `integer` | SÍ | 1 | Constante funcional (`30`) |
| `credit_limit` | `numeric` | SÍ | 1 | Constante funcional (`50000.0`) |
| `credit_insurance` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `invoice_grouping` | `text` | SÍ | 1 | Constante funcional (`MONTHLY`) |
| `requires_order_reference` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `tax_regime` | `text` | SÍ | 1 | Constante funcional (`GENERAL`) |
| `invoice_channel` | `text` | SÍ | 1 | Constante funcional (`EMAIL`) |
| `billing_email` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `sales_email` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 24. `public.customer_blocks`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `blocked_by` &rarr; `public.auth.users(id)` (Constraint: `customer_blocks_blocked_by_fkey`)
- `released_by` &rarr; `public.auth.users(id)` (Constraint: `customer_blocks_released_by_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `customer_blocks_tenant_id_fkey`)
- `party_id` &rarr; `public.parties(id)` (Constraint: `customer_blocks_party_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `party_id` | `uuid` | NO | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `block_type` | `text` | NO | 1 | Constante funcional (`OPERATIONAL`) |
| `behavior` | `text` | NO | 1 | Constante funcional (`WARNING`) |
| `reason` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `blocked_by` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `blocked_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `released_by` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `released_at` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `release_reason` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |

### 25. `public.carrier_profiles`
- **Capa:** L2
- **Clave Primaria:** `party_id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 13

**Claves Foráneas Salientes (Integridad Referencial):**
- `party_id` &rarr; `public.parties(id)` (Constraint: `carrier_profiles_party_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `carrier_profiles_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `party_id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `carrier_code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `transport_licence_number` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `insurance_policy_number` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `insurance_carrier_name` | `text` | SÍ | 1 | Constante funcional (`Seguros Ficticios S.A.`) |
| `insurance_coverage_amount` | `numeric` | SÍ | 1 | Constante funcional (`300000.0`) |
| `insurance_expiry_date` | `date` | SÍ | 1 | Constante funcional (`2027-12-31`) |
| `adr_certified` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `qualification_status` | `text` | NO | 1 | Constante funcional (`APPROVED`) |
| `qualification_notes` | `text` | SÍ | 1 | Constante funcional (`Transportista homologa...`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 26. `public.fuel_index_values`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 7

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, fuel_index_id` &rarr; `public.fuel_indices(tenant_id, id)` (Constraint: `fuel_index_values_index_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `fuel_index_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `period_start` | `date` | NO | 1 | Constante funcional (`2026-10-01`) |
| `period_end` | `date` | NO | 1 | Constante funcional (`2026-10-31`) |
| `observed_value` | `numeric` | NO | 1 | Constante funcional (`1.452`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 27. `public.fuel_index_bands`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 10

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, fuel_index_id` &rarr; `public.fuel_indices(tenant_id, id)` (Constraint: `fuel_index_bands_index_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `fuel_index_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `value_from` | `numeric` | NO | 1 | Constante funcional (`1.4`) |
| `value_to` | `numeric` | NO | 1 | Constante funcional (`1.5`) |
| `surcharge_percent` | `numeric` | SÍ | 1 | Constante funcional (`3.5`) |
| `surcharge_amount` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `valid_from` | `date` | NO | 1 | Constante funcional (`2026-01-01`) |
| `valid_to` | `date` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 28. `public.product_packagings`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 19

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `product_packagings_tenant_id_fkey`)
- `parent_pack_id` &rarr; `public.product_packagings(id)` (Constraint: `product_packagings_parent_pack_id_fkey`)
- `tenant_id, product_id` &rarr; `public.products(tenant_id, id)` (Constraint: `product_packagings_product_tenant_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `product_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `pack_code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `pack_type` | `text` | NO | 1 | Constante funcional (`MASTER_CARTON`) |
| `barcode` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `units_per_pack` | `numeric` | NO | 1 | Constante funcional (`24.0`) |
| `parent_pack_id` | `uuid` | SÍ | 0 | FK referenciada a `product_packagings.id` (0 relaciones consistentes) |
| `gross_weight_kg` | `numeric` | SÍ | 1 | Constante funcional (`15.0`) |
| `length_cm` | `numeric` | SÍ | 1 | Constante funcional (`60.0`) |
| `width_cm` | `numeric` | SÍ | 1 | Constante funcional (`40.0`) |
| `height_cm` | `numeric` | SÍ | 1 | Constante funcional (`30.0`) |
| `volume_m3` | `numeric` | SÍ | 1 | Constante funcional (`0.072`) |
| `ti_boxes_per_layer` | `integer` | SÍ | 1 | Constante funcional (`4`) |
| `hi_layers` | `integer` | SÍ | 1 | Constante funcional (`5`) |
| `is_stackable` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `is_active` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 29. `public.warehouses`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 10

**Claves Foráneas Salientes (Integridad Referencial):**
- `address_id` &rarr; `public.party_addresses(id)` (Constraint: `warehouses_address_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `warehouses_tenant_id_fkey`)
- `owner_party_id` &rarr; `public.parties(id)` (Constraint: `warehouses_owner_party_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `owner_party_id` | `uuid` | SÍ | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `status` | `text` | NO | 1 | Constante funcional (`ACTIVE`) |
| `capabilities` | `jsonb` | NO | 1 | Constante funcional (`{'cross_dock': True, '...`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 30. `public.warehouse_zones`
- **Capa:** L2
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 10

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `warehouse_zones_tenant_id_fkey`)
- `warehouse_id` &rarr; `public.warehouses(id)` (Constraint: `warehouse_zones_warehouse_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `warehouse_id` | `uuid` | NO | 150 | FK referenciada a `warehouses.id` (150 relaciones consistentes) |
| `zone_code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `zone_name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `zone_type` | `text` | NO | 1 | Constante funcional (`STORAGE`) |
| `temperature_regime` | `text` | NO | 1 | Constante funcional (`AMBIENT`) |
| `is_active` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

## Capa Topológica L3 (14 tablas)

### 31. `public.companies`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `companies_tenant_id_fkey`)
- `fiscal_address_id` &rarr; `public.party_addresses(id)` (Constraint: `companies_fiscal_address_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `company_code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `legal_name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `trade_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `tax_id` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `country_code` | `character` | NO | 1 | Constante funcional (`ES`) |
| `functional_currency` | `character` | NO | 1 | Constante funcional (`EUR`) |
| `fiscal_address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `timezone` | `text` | NO | 1 | Constante funcional (`Europe/Madrid`) |
| `status` | `text` | NO | 1 | Constante funcional (`ACTIVE`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 32. `public.party_roles`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `party_roles_tenant_id_fkey`)
- `party_id` &rarr; `public.parties(id)` (Constraint: `party_roles_party_id_fkey`)
- `company_id` &rarr; `public.companies(id)` (Constraint: `party_roles_company_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `party_id` | `uuid` | NO | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `company_id` | `uuid` | SÍ | 150 | FK referenciada a `companies.id` (150 relaciones consistentes) |
| `role_code` | `text` | NO | 2 | Distribución de 2 variantes categóricas / numéricas |
| `valid_from` | `date` | NO | 1 | Constante funcional (`2026-01-01`) |
| `valid_to` | `date` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `status` | `text` | NO | 1 | Constante funcional (`ACTIVE`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 33. `public.party_services`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `party_services_tenant_id_fkey`)
- `party_id` &rarr; `public.parties(id)` (Constraint: `party_services_party_id_fkey`)
- `service_id` &rarr; `public.service_catalog(id)` (Constraint: `party_services_service_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `party_id` | `uuid` | NO | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `service_id` | `uuid` | NO | 150 | FK referenciada a `service_catalog.id` (150 relaciones consistentes) |
| `relationship_type` | `text` | NO | 1 | Constante funcional (`OFFERED`) |
| `reference` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `price` | `numeric` | SÍ | 1 | Constante funcional (`150.0`) |
| `currency` | `character` | NO | 1 | Constante funcional (`EUR`) |
| `valid_from` | `date` | SÍ | 1 | Constante funcional (`2026-01-01`) |
| `valid_to` | `date` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `conditions` | `jsonb` | NO | 1 | Constante funcional (`{'batch': 'DATA150-PRO...`) |
| `is_active` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 34. `public.address_operational_profiles`
- **Capa:** L3
- **Clave Primaria:** `address_id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 18

**Claves Foráneas Salientes (Integridad Referencial):**
- `address_id` &rarr; `public.party_addresses(id)` (Constraint: `address_operational_profiles_address_id_fkey`)
- `account_manager_user_id` &rarr; `public.auth.users(id)` (Constraint: `address_operational_profiles_account_manager_user_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `address_operational_profiles_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `address_id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `has_dock` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `needs_forklift` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `requires_appointment` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `pallet_exchange` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `adr_capable` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `temperature_controlled` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `temperature_min` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `temperature_max` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `geofence_radius_m` | `integer` | SÍ | 1 | Constante funcional (`150`) |
| `opening_hours` | `jsonb` | NO | 1 | Constante funcional (`{'mon_fri': '08:00-18:...`) |
| `holiday_exceptions` | `jsonb` | NO | 1 | Constante funcional (`[]`) |
| `average_wait_minutes` | `integer` | SÍ | 1 | Constante funcional (`25`) |
| `access_instructions` | `text` | SÍ | 1 | Constante funcional (`Entrada por muelle sec...`) |
| `account_manager_user_id` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 35. `public.party_address_assignments`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `party_address_assignments_tenant_id_fkey`)
- `created_by` &rarr; `public.auth.users(id)` (Constraint: `party_address_assignments_created_by_fkey`)
- `party_id` &rarr; `public.parties(id)` (Constraint: `party_address_assignments_party_id_fkey`)
- `address_id` &rarr; `public.party_addresses(id)` (Constraint: `party_address_assignments_address_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `address_id` | `uuid` | NO | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `party_id` | `uuid` | NO | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `use_for_pickup` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `use_for_delivery` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `is_default_pickup` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `is_default_delivery` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `created_by` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 36. `public.warehouse_bins`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 18

**Claves Foráneas Salientes (Integridad Referencial):**
- `warehouse_id` &rarr; `public.warehouses(id)` (Constraint: `warehouse_bins_warehouse_id_fkey`)
- `zone_id` &rarr; `public.warehouse_zones(id)` (Constraint: `warehouse_bins_zone_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `warehouse_bins_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `warehouse_id` | `uuid` | NO | 150 | FK referenciada a `warehouses.id` (150 relaciones consistentes) |
| `zone_id` | `uuid` | SÍ | 150 | FK referenciada a `warehouse_zones.id` (150 relaciones consistentes) |
| `bin_code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `aisle` | `text` | SÍ | 1 | Constante funcional (`A`) |
| `rack` | `text` | SÍ | 1 | Constante funcional (`1`) |
| `shelf` | `text` | SÍ | 1 | Constante funcional (`1`) |
| `bin_position` | `text` | SÍ | 1 | Constante funcional (`1`) |
| `bin_type` | `text` | NO | 1 | Constante funcional (`PALLET_RACK`) |
| `max_weight_kg` | `numeric` | SÍ | 1 | Constante funcional (`1000.0`) |
| `max_volume_m3` | `numeric` | SÍ | 1 | Constante funcional (`2.5`) |
| `max_pallets` | `integer` | NO | 1 | Constante funcional (`2`) |
| `is_blocked` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `block_reason` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `is_active` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 37. `public.tariff_lines`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 16

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `tariff_lines_tenant_id_fkey`)
- `tariff_header_id` &rarr; `public.tariff_headers(id)` (Constraint: `tariff_lines_tariff_header_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `tariff_header_id` | `uuid` | NO | 150 | FK referenciada a `tariff_headers.id` (150 relaciones consistentes) |
| `pricing_unit` | `text` | NO | 1 | Constante funcional (`SHIPMENT`) |
| `from_quantity` | `numeric` | NO | 1 | Constante funcional (`1.0`) |
| `to_quantity` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `unit_price` | `numeric` | NO | 1 | Constante funcional (`150.0`) |
| `minimum_amount` | `numeric` | SÍ | 1 | Constante funcional (`50.0`) |
| `adr_surcharge` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `liftgate_surcharge` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `waiting_time_rate` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `customs_fee` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `fuel_surcharge_formula` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `discount_percent` | `numeric` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `component` | `text` | NO | 1 | Constante funcional (`BASE_FREIGHT`) |

### 38. `public.tariff_assignments`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 6

**Claves Foráneas Salientes (Integridad Referencial):**
- `tariff_header_id` &rarr; `public.tariff_headers(id)` (Constraint: `tariff_assignments_tariff_header_id_fkey`)
- `party_id` &rarr; `public.parties(id)` (Constraint: `tariff_assignments_party_id_fkey`)
- `created_by` &rarr; `public.auth.users(id)` (Constraint: `tariff_assignments_created_by_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `tariff_assignments_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `tariff_header_id` | `uuid` | NO | 150 | FK referenciada a `tariff_headers.id` (150 relaciones consistentes) |
| `party_id` | `uuid` | NO | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `created_by` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 39. `public.tariff_rules`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, tariff_header_id` &rarr; `public.tariff_headers(tenant_id, id)` (Constraint: `tariff_rules_header_fk`)
- `tenant_id, applies_to_zone_id` &rarr; `public.tariff_zones(tenant_id, id)` (Constraint: `tariff_rules_zone_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `tariff_header_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `rule_type` | `text` | NO | 1 | Constante funcional (`FIXED_PER_SHIPMENT`) |
| `component` | `text` | NO | 1 | Constante funcional (`SURCHARGE`) |
| `params` | `jsonb` | NO | 1 | Constante funcional (`{'amount': 15.0}`) |
| `params_schema_version` | `integer` | NO | 1 | Constante funcional (`1`) |
| `applies_to_zone_id` | `uuid` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `valid_from` | `date` | NO | 1 | Constante funcional (`2026-01-01`) |
| `valid_to` | `date` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `priority` | `integer` | NO | 1 | Constante funcional (`1`) |
| `is_active` | `boolean` | NO | 1 | Constante funcional (`True`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 40. `public.transit_times`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, service_id` &rarr; `public.service_catalog(tenant_id, id)` (Constraint: `transit_times_service_fk`)
- `tenant_id, destination_zone_id` &rarr; `public.tariff_zones(tenant_id, id)` (Constraint: `transit_times_destination_zone_fk`)
- `tenant_id, party_id` &rarr; `public.parties(tenant_id, id)` (Constraint: `transit_times_party_fk`)
- `tenant_id, origin_zone_id` &rarr; `public.tariff_zones(tenant_id, id)` (Constraint: `transit_times_origin_zone_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `party_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `service_id` | `uuid` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `origin_zone_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `destination_zone_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `transit_mode` | `text` | NO | 1 | Constante funcional (`BUSINESS_DAYS`) |
| `planned_duration_minutes` | `integer` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `business_days` | `integer` | SÍ | 1 | Constante funcional (`1`) |
| `valid_from` | `date` | NO | 1 | Constante funcional (`2026-01-01`) |
| `valid_to` | `date` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `priority` | `integer` | NO | 1 | Constante funcional (`1`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 41. `public.external_service_mappings`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 12

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, internal_service_id` &rarr; `public.service_catalog(tenant_id, id)` (Constraint: `external_service_mappings_service_fk`)
- `tenant_id, party_id` &rarr; `public.parties(tenant_id, id)` (Constraint: `external_service_mappings_party_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `party_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `internal_service_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `external_code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `external_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `legacy_name` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `valid_from` | `date` | SÍ | 1 | Constante funcional (`2026-01-01`) |
| `valid_to` | `date` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 42. `public.pricing_runs`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 18

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, tariff_header_id` &rarr; `public.tariff_headers(tenant_id, id)` (Constraint: `pricing_runs_header_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `kind` | `text` | NO | 1 | Constante funcional (`SELL`) |
| `tariff_header_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `tariff_header_version` | `integer` | NO | 1 | Constante funcional (`1`) |
| `billable_quantity` | `numeric` | NO | 1 | Constante funcional (`1.0`) |
| `billable_unit` | `text` | NO | 1 | Constante funcional (`SHIPMENT`) |
| `pickup_amount` | `numeric` | SÍ | 1 | Constante funcional (`25.0`) |
| `linehaul_amount` | `numeric` | SÍ | 1 | Constante funcional (`100.0`) |
| `delivery_amount` | `numeric` | SÍ | 1 | Constante funcional (`25.0`) |
| `surcharge_amount` | `numeric` | SÍ | 1 | Constante funcional (`0.0`) |
| `currency` | `character` | NO | 1 | Constante funcional (`EUR`) |
| `total` | `numeric` | NO | 1 | Constante funcional (`150.0`) |
| `input` | `jsonb` | NO | 1 | Constante funcional (`{'weight': 500, 'packa...`) |
| `trace` | `jsonb` | NO | 1 | Constante funcional (`{'rules_applied': 1}`) |
| `breakdown` | `jsonb` | NO | 1 | Constante funcional (`{'base': 150.0}`) |
| `engine_version` | `text` | NO | 1 | Constante funcional (`1.0.0`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 43. `public.offers`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 21

**Claves Foráneas Salientes (Integridad Referencial):**
- `customer_id` &rarr; `public.parties(id)` (Constraint: `offers_customer_id_fkey`)
- `tenant_id, cost_pricing_run_id` &rarr; `public.pricing_runs(tenant_id, id)` (Constraint: `offers_cost_pricing_run_tenant_fk`)
- `tenant_id, sell_pricing_run_id` &rarr; `public.pricing_runs(tenant_id, id)` (Constraint: `offers_sell_pricing_run_tenant_fk`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `offers_tenant_id_fkey`)
- `service_id` &rarr; `public.service_catalog(id)` (Constraint: `offers_service_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `customer_id` | `uuid` | NO | 100 | FK referenciada a `parties.id` (100 relaciones consistentes) |
| `service_id` | `uuid` | SÍ | 150 | FK referenciada a `service_catalog.id` (150 relaciones consistentes) |
| `status` | `text` | NO | 1 | Constante funcional (`ACCEPTED`) |
| `currency` | `character` | NO | 1 | Constante funcional (`EUR`) |
| `subtotal` | `numeric` | NO | 1 | Constante funcional (`150.0`) |
| `taxes` | `numeric` | NO | 1 | Constante funcional (`31.5`) |
| `total` | `numeric` | NO | 1 | Constante funcional (`181.5`) |
| `valid_until` | `date` | SÍ | 1 | Constante funcional (`2026-12-31`) |
| `conditions` | `text` | SÍ | 1 | Constante funcional (`Condiciones estándar d...`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `pricing_snapshot` | `jsonb` | NO | 1 | Constante funcional (`{'total': 181.5}`) |
| `cost_pricing_run_id` | `uuid` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `sell_pricing_run_id` | `uuid` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `margin_amount` | `numeric` | SÍ | 1 | Constante funcional (`30.0`) |
| `margin_percent` | `numeric` | SÍ | 1 | Constante funcional (`20.0`) |
| `result` | `text` | SÍ | 1 | Constante funcional (`WON`) |

### 44. `public.orders`
- **Capa:** L3
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 31

**Claves Foráneas Salientes (Integridad Referencial):**
- `customer_id` &rarr; `public.parties(id)` (Constraint: `orders_customer_id_fkey`)
- `service_id` &rarr; `public.service_catalog(id)` (Constraint: `orders_service_id_fkey`)
- `pickup_address_id` &rarr; `public.party_addresses(id)` (Constraint: `orders_pickup_address_id_fkey`)
- `delivery_address_id` &rarr; `public.party_addresses(id)` (Constraint: `orders_delivery_address_id_fkey`)
- `hazmat_edition_id` &rarr; `public.hazmat_editions(id)` (Constraint: `orders_hazmat_edition_id_fkey`)
- `supersedes_order_id` &rarr; `public.orders(id)` (Constraint: `orders_supersedes_order_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `orders_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `customer_id` | `uuid` | NO | 100 | FK referenciada a `parties.id` (100 relaciones consistentes) |
| `customer_reference` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `service_id` | `uuid` | SÍ | 150 | FK referenciada a `service_catalog.id` (150 relaciones consistentes) |
| `pickup_address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `delivery_address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `requested_pickup_start` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `requested_pickup_end` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `requested_delivery_start` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `requested_delivery_end` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `packages` | `integer` | SÍ | 1 | Constante funcional (`5`) |
| `gross_weight` | `numeric` | SÍ | 1 | Constante funcional (`250.0`) |
| `volume` | `numeric` | SÍ | 1 | Constante funcional (`1.2`) |
| `linear_meters` | `numeric` | SÍ | 1 | Constante funcional (`0.8`) |
| `goods_description` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `adr` | `jsonb` | NO | 1 | Constante funcional (`{'is_adr': False}`) |
| `status` | `text` | NO | 1 | Constante funcional (`COMPLETED`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `hazmat_declaration` | `text` | NO | 1 | Constante funcional (`NO`) |
| `hazmat_edition_id` | `uuid` | SÍ | 0 | FK referenciada a `hazmat_editions.id` (0 relaciones consistentes) |
| `hazmat_validation_status` | `text` | NO | 1 | Constante funcional (`NOT_EVALUATED`) |
| `revision_number` | `integer` | NO | 1 | Constante funcional (`1`) |
| `business_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `supersedes_order_id` | `uuid` | SÍ | 0 | FK referenciada a `orders.id` (0 relaciones consistentes) |
| `launched_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `revoked_at` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `pricing_snapshot` | `jsonb` | NO | 1 | Constante funcional (`{'total': 181.5}`) |

## Capa Topológica L4 (6 tablas)

### 45. `public.offer_lines`
- **Capa:** L4
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `offer_id` &rarr; `public.offers(id)` (Constraint: `offer_lines_offer_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `offer_lines_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `offer_id` | `uuid` | NO | 150 | FK referenciada a `offers.id` (150 relaciones consistentes) |
| `line_number` | `integer` | NO | 1 | Constante funcional (`1`) |
| `description` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `quantity` | `numeric` | NO | 1 | Constante funcional (`1.0`) |
| `unit_price` | `numeric` | NO | 1 | Constante funcional (`150.0`) |
| `total` | `numeric` | NO | 1 | Constante funcional (`150.0`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `override_reason` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `overridden_by` | `uuid` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |

### 46. `public.order_lines`
- **Capa:** L4
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `order_id` &rarr; `public.orders(id)` (Constraint: `order_lines_order_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `order_lines_tenant_id_fkey`)
- `tenant_id, product_id` &rarr; `public.products(tenant_id, id)` (Constraint: `order_lines_product_tenant_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `order_id` | `uuid` | NO | 150 | FK referenciada a `orders.id` (150 relaciones consistentes) |
| `line_number` | `integer` | NO | 1 | Constante funcional (`1`) |
| `description` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `sku` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `packages` | `integer` | SÍ | 1 | Constante funcional (`5`) |
| `gross_weight` | `numeric` | SÍ | 1 | Constante funcional (`250.0`) |
| `volume` | `numeric` | SÍ | 1 | Constante funcional (`1.2`) |
| `adr` | `jsonb` | NO | 1 | Constante funcional (`{'is_adr': False}`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `product_id` | `uuid` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `hazard_status` | `text` | NO | 1 | Constante funcional (`NON_HAZARDOUS`) |

### 47. `public.delivery_notes`
- **Capa:** L4
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 19

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `delivery_notes_tenant_id_fkey`)
- `order_id` &rarr; `public.orders(id)` (Constraint: `delivery_notes_order_id_fkey`)
- `delivery_address_id` &rarr; `public.party_addresses(id)` (Constraint: `delivery_notes_delivery_address_id_fkey`)
- `pickup_address_id` &rarr; `public.party_addresses(id)` (Constraint: `delivery_notes_pickup_address_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `order_id` | `uuid` | NO | 150 | FK referenciada a `orders.id` (150 relaciones consistentes) |
| `external_reference` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `pickup_address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `delivery_address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `pickup_window_start` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `pickup_window_end` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `delivery_window_start` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `delivery_window_end` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `packages` | `integer` | SÍ | 1 | Constante funcional (`5`) |
| `gross_weight` | `numeric` | SÍ | 1 | Constante funcional (`250.0`) |
| `volume` | `numeric` | SÍ | 1 | Constante funcional (`1.2`) |
| `goods_description` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `status` | `text` | NO | 1 | Constante funcional (`DELIVERED`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 48. `public.expeditions`
- **Capa:** L4
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 14

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `expeditions_tenant_id_fkey`)
- `service_id` &rarr; `public.service_catalog(id)` (Constraint: `expeditions_service_id_fkey`)
- `carrier_id` &rarr; `public.parties(id)` (Constraint: `expeditions_carrier_id_fkey`)
- `origin_address_id` &rarr; `public.party_addresses(id)` (Constraint: `expeditions_origin_address_id_fkey`)
- `destination_address_id` &rarr; `public.party_addresses(id)` (Constraint: `expeditions_destination_address_id_fkey`)
- `order_id` &rarr; `public.orders(id)` (Constraint: `expeditions_order_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `service_id` | `uuid` | SÍ | 150 | FK referenciada a `service_catalog.id` (150 relaciones consistentes) |
| `carrier_id` | `uuid` | SÍ | 30 | FK referenciada a `parties.id` (30 relaciones consistentes) |
| `origin_address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `destination_address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `planned_departure` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `planned_arrival` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `status` | `text` | NO | 1 | Constante funcional (`DELIVERED`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `order_id` | `uuid` | SÍ | 150 | FK referenciada a `orders.id` (150 relaciones consistentes) |

### 49. `public.order_hazmat_assessments`
- **Capa:** L4
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `order_id` &rarr; `public.orders(id)` (Constraint: `order_hazmat_assessments_order_id_fkey`)
- `edition_id` &rarr; `public.hazmat_editions(id)` (Constraint: `order_hazmat_assessments_edition_id_fkey`)
- `assessed_by` &rarr; `public.auth.users(id)` (Constraint: `order_hazmat_assessments_assessed_by_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `order_hazmat_assessments_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `order_id` | `uuid` | NO | 150 | FK referenciada a `orders.id` (150 relaciones consistentes) |
| `edition_id` | `uuid` | SÍ | 0 | FK referenciada a `hazmat_editions.id` (0 relaciones consistentes) |
| `status` | `text` | NO | 1 | Constante funcional (`VALIDATED`) |
| `category_totals` | `jsonb` | NO | 1 | Constante funcional (`{'exempt': True}`) |
| `points_total` | `numeric` | SÍ | 1 | Constante funcional (`0.0`) |
| `warnings` | `jsonb` | NO | 1 | Constante funcional (`[]`) |
| `input_hash` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `assessed_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `assessed_by` | `uuid` | SÍ | 0 | FK referenciada a `auth.users.id` (0 relaciones consistentes) |

### 50. `public.inventory_quants`
- **Capa:** L4
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 16

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, product_id` &rarr; `public.products(tenant_id, id)` (Constraint: `inventory_quants_product_tenant_fk`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `inventory_quants_tenant_id_fkey`)
- `warehouse_id` &rarr; `public.warehouses(id)` (Constraint: `inventory_quants_warehouse_id_fkey`)
- `bin_id` &rarr; `public.warehouse_bins(id)` (Constraint: `inventory_quants_bin_id_fkey`)
- `owner_party_id` &rarr; `public.parties(id)` (Constraint: `inventory_quants_owner_party_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `warehouse_id` | `uuid` | NO | 150 | FK referenciada a `warehouses.id` (150 relaciones consistentes) |
| `bin_id` | `uuid` | NO | 150 | FK referenciada a `warehouse_bins.id` (150 relaciones consistentes) |
| `product_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `owner_party_id` | `uuid` | SÍ | 100 | FK referenciada a `parties.id` (100 relaciones consistentes) |
| `batch_number` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `serial_number` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `expiry_date` | `date` | SÍ | 1 | Constante funcional (`2027-12-31`) |
| `quantity_on_hand` | `numeric` | NO | 1 | Constante funcional (`100.0`) |
| `quantity_reserved` | `numeric` | NO | 1 | Constante funcional (`0.0`) |
| `uom` | `text` | NO | 1 | Constante funcional (`UN`) |
| `stock_status` | `text` | NO | 1 | Constante funcional (`AVAILABLE`) |
| `last_counted_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

## Capa Topológica L5 (5 tablas)

### 51. `public.pricing_run_components`
- **Capa:** L5
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 13

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id, source_rule_id` &rarr; `public.tariff_rules(tenant_id, id)` (Constraint: `pricing_run_components_rule_fk`)
- `tenant_id, pricing_run_id` &rarr; `public.pricing_runs(tenant_id, id)` (Constraint: `pricing_run_components_run_fk`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | Aislamiento multitenant fijo (`tenant titular FORNEXA`) |
| `pricing_run_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `sequence` | `integer` | NO | 1 | Constante funcional (`1`) |
| `component` | `text` | NO | 1 | Constante funcional (`BASE_FREIGHT`) |
| `description` | `text` | SÍ | 1 | Constante funcional (`Porte base por envío c...`) |
| `source_rule_id` | `uuid` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `quantity` | `numeric` | SÍ | 1 | Constante funcional (`1.0`) |
| `unit` | `text` | SÍ | 1 | Constante funcional (`SHIPMENT`) |
| `rate` | `numeric` | SÍ | 1 | Constante funcional (`150.0`) |
| `amount` | `numeric` | NO | 1 | Constante funcional (`150.0`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 52. `public.delivery_note_lines`
- **Capa:** L5
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 10

**Claves Foráneas Salientes (Integridad Referencial):**
- `delivery_note_id` &rarr; `public.delivery_notes(id)` (Constraint: `delivery_note_lines_delivery_note_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `delivery_note_lines_tenant_id_fkey`)
- `order_line_id` &rarr; `public.order_lines(id)` (Constraint: `delivery_note_lines_order_line_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `delivery_note_id` | `uuid` | NO | 150 | FK referenciada a `delivery_notes.id` (150 relaciones consistentes) |
| `order_line_id` | `uuid` | SÍ | 150 | FK referenciada a `order_lines.id` (150 relaciones consistentes) |
| `line_number` | `integer` | NO | 1 | Constante funcional (`1`) |
| `description` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `packages` | `integer` | SÍ | 1 | Constante funcional (`5`) |
| `gross_weight` | `numeric` | SÍ | 1 | Constante funcional (`250.0`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 53. `public.expedition_delivery_notes`
- **Capa:** L5
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 5

**Claves Foráneas Salientes (Integridad Referencial):**
- `delivery_note_id` &rarr; `public.delivery_notes(id)` (Constraint: `expedition_delivery_notes_delivery_note_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `expedition_delivery_notes_tenant_id_fkey`)
- `expedition_id` &rarr; `public.expeditions(id)` (Constraint: `expedition_delivery_notes_expedition_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `expedition_id` | `uuid` | NO | 150 | FK referenciada a `expeditions.id` (150 relaciones consistentes) |
| `delivery_note_id` | `uuid` | NO | 150 | FK referenciada a `delivery_notes.id` (150 relaciones consistentes) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 54. `public.inventory_movements`
- **Capa:** L5
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 24

**Claves Foráneas Salientes (Integridad Referencial):**
- `reference_delivery_note_id` &rarr; `public.delivery_notes(id)` (Constraint: `inventory_movements_reference_delivery_note_id_fkey`)
- `warehouse_id` &rarr; `public.warehouses(id)` (Constraint: `inventory_movements_warehouse_id_fkey`)
- `source_bin_id` &rarr; `public.warehouse_bins(id)` (Constraint: `inventory_movements_source_bin_id_fkey`)
- `destination_bin_id` &rarr; `public.warehouse_bins(id)` (Constraint: `inventory_movements_destination_bin_id_fkey`)
- `owner_party_id` &rarr; `public.parties(id)` (Constraint: `inventory_movements_owner_party_id_fkey`)
- `reference_order_id` &rarr; `public.orders(id)` (Constraint: `inventory_movements_reference_order_id_fkey`)
- `tenant_id, product_id` &rarr; `public.products(tenant_id, id)` (Constraint: `inventory_movements_product_tenant_fk`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `inventory_movements_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `movement_number` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `warehouse_id` | `uuid` | NO | 150 | FK referenciada a `warehouses.id` (150 relaciones consistentes) |
| `movement_type` | `text` | NO | 1 | Constante funcional (`RECEIPT`) |
| `product_id` | `uuid` | NO | 150 | 150 valores sintéticos completos y distintos |
| `source_bin_id` | `uuid` | SÍ | 0 | FK referenciada a `warehouse_bins.id` (0 relaciones consistentes) |
| `destination_bin_id` | `uuid` | SÍ | 150 | FK referenciada a `warehouse_bins.id` (150 relaciones consistentes) |
| `quantity` | `numeric` | NO | 1 | Constante funcional (`100.0`) |
| `uom` | `text` | NO | 1 | Constante funcional (`UN`) |
| `owner_party_id` | `uuid` | SÍ | 100 | FK referenciada a `parties.id` (100 relaciones consistentes) |
| `batch_number` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `serial_number` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `reference_order_id` | `uuid` | SÍ | 150 | FK referenciada a `orders.id` (150 relaciones consistentes) |
| `reference_delivery_note_id` | `uuid` | SÍ | 150 | FK referenciada a `delivery_notes.id` (150 relaciones consistentes) |
| `operator_id` | `text` | SÍ | 1 | Constante funcional (`DATA150_OPERATOR`) |
| `requested_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `started_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `completed_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `duration_seconds` | `integer` | SÍ | 1 | Constante funcional (`120`) |
| `status` | `text` | NO | 1 | Constante funcional (`COMPLETED`) |
| `notes` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 55. `public.trips`
- **Capa:** L5
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 15

**Claves Foráneas Salientes (Integridad Referencial):**
- `carrier_id` &rarr; `public.parties(id)` (Constraint: `trips_carrier_id_fkey`)
- `vehicle_id` &rarr; `public.vehicles(id)` (Constraint: `trips_vehicle_id_fkey`)
- `driver_id` &rarr; `public.drivers(id)` (Constraint: `trips_driver_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `trips_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `code` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `carrier_id` | `uuid` | SÍ | 30 | FK referenciada a `parties.id` (30 relaciones consistentes) |
| `vehicle_id` | `uuid` | SÍ | 150 | FK referenciada a `vehicles.id` (150 relaciones consistentes) |
| `trailer_registration` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `driver_id` | `uuid` | SÍ | 150 | FK referenciada a `drivers.id` (150 relaciones consistentes) |
| `planned_start` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `actual_start` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `planned_end` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `actual_end` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `status` | `text` | NO | 1 | Constante funcional (`COMPLETED`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

## Capa Topológica L6 (2 tablas)

### 56. `public.trip_expeditions`
- **Capa:** L6
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 6

**Claves Foráneas Salientes (Integridad Referencial):**
- `trip_id` &rarr; `public.trips(id)` (Constraint: `trip_expeditions_trip_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `trip_expeditions_tenant_id_fkey`)
- `expedition_id` &rarr; `public.expeditions(id)` (Constraint: `trip_expeditions_expedition_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `trip_id` | `uuid` | NO | 150 | FK referenciada a `trips.id` (150 relaciones consistentes) |
| `expedition_id` | `uuid` | NO | 150 | FK referenciada a `expeditions.id` (150 relaciones consistentes) |
| `sequence` | `integer` | SÍ | 1 | Constante funcional (`1`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 57. `public.trip_stops`
- **Capa:** L6
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 21

**Claves Foráneas Salientes (Integridad Referencial):**
- `address_id` &rarr; `public.party_addresses(id)` (Constraint: `trip_stops_address_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `trip_stops_tenant_id_fkey`)
- `trip_id` &rarr; `public.trips(id)` (Constraint: `trip_stops_trip_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `trip_id` | `uuid` | NO | 150 | FK referenciada a `trips.id` (150 relaciones consistentes) |
| `sequence` | `integer` | NO | 1 | Constante funcional (`1`) |
| `stop_type` | `text` | NO | 1 | Constante funcional (`PICKUP`) |
| `address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `company_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `full_address` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `latitude` | `numeric` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `longitude` | `numeric` | SÍ | 101 | Distribución de 101 variantes categóricas / numéricas |
| `window_start` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `window_end` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `contact_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `contact_phone` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `operational_reference` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `status` | `text` | NO | 1 | Constante funcional (`COMPLETED`) |
| `arrived_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `completed_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

## Capa Topológica L7 (4 tablas)

### 58. `public.trip_stop_delivery_notes`
- **Capa:** L7
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 6

**Claves Foráneas Salientes (Integridad Referencial):**
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `trip_stop_delivery_notes_tenant_id_fkey`)
- `trip_stop_id` &rarr; `public.trip_stops(id)` (Constraint: `trip_stop_delivery_notes_trip_stop_id_fkey`)
- `delivery_note_id` &rarr; `public.delivery_notes(id)` (Constraint: `trip_stop_delivery_notes_delivery_note_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `trip_stop_id` | `uuid` | NO | 150 | FK referenciada a `trip_stops.id` (150 relaciones consistentes) |
| `delivery_note_id` | `uuid` | NO | 150 | FK referenciada a `delivery_notes.id` (150 relaciones consistentes) |
| `operation` | `text` | NO | 1 | Constante funcional (`PICKUP`) |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 59. `public.trip_hazmat_assessments`
- **Capa:** L7
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 11

**Claves Foráneas Salientes (Integridad Referencial):**
- `trip_id` &rarr; `public.trips(id)` (Constraint: `trip_hazmat_assessments_trip_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `trip_hazmat_assessments_tenant_id_fkey`)
- `edition_id` &rarr; `public.hazmat_editions(id)` (Constraint: `trip_hazmat_assessments_edition_id_fkey`)
- `trip_stop_id` &rarr; `public.trip_stops(id)` (Constraint: `trip_hazmat_assessments_trip_stop_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `trip_id` | `uuid` | NO | 150 | FK referenciada a `trips.id` (150 relaciones consistentes) |
| `trip_stop_id` | `uuid` | SÍ | 150 | FK referenciada a `trip_stops.id` (150 relaciones consistentes) |
| `edition_id` | `uuid` | SÍ | 0 | FK referenciada a `hazmat_editions.id` (0 relaciones consistentes) |
| `sequence` | `integer` | SÍ | 1 | Constante funcional (`1`) |
| `category_totals` | `jsonb` | NO | 1 | Constante funcional (`{'exempt': True}`) |
| `points_total` | `numeric` | SÍ | 1 | Constante funcional (`0.0`) |
| `warnings` | `jsonb` | NO | 1 | Constante funcional (`[]`) |
| `input_hash` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `assessed_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |

### 60. `public.cmr_documents`
- **Capa:** L7
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 44

**Claves Foráneas Salientes (Integridad Referencial):**
- `sender_party_id` &rarr; `public.parties(id)` (Constraint: `cmr_documents_sender_party_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `cmr_documents_tenant_id_fkey`)
- `expedition_record_id` &rarr; `public.expeditions(id)` (Constraint: `cmr_documents_expedition_record_id_fkey`)
- `carrier_party_id` &rarr; `public.parties(id)` (Constraint: `cmr_documents_carrier_party_id_fkey`)
- `trip_record_id` &rarr; `public.trips(id)` (Constraint: `cmr_documents_trip_record_id_fkey`)
- `recipient_party_id` &rarr; `public.parties(id)` (Constraint: `cmr_documents_recipient_party_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_number` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `access_key` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `status` | `text` | NO | 1 | Constante funcional (`Borrador`) |
| `source` | `text` | NO | 1 | Constante funcional (`DATA150_BATCH`) |
| `expedition_id` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `trip_id` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `customer_ids` | `ARRAY` | NO | 100 | Distribución de 100 variantes categóricas / numéricas |
| `sender` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `recipient` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `pickup_location` | `text` | NO | 49 | Distribución de 49 variantes categóricas / numéricas |
| `delivery_location` | `text` | NO | 49 | Distribución de 49 variantes categóricas / numéricas |
| `carrier` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `vehicle_registration` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `trailer_registration` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `goods_description` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `packages` | `integer` | SÍ | 1 | Constante funcional (`5`) |
| `packaging` | `text` | SÍ | 1 | Constante funcional (`Palet`) |
| `gross_weight` | `numeric` | SÍ | 1 | Constante funcional (`250.0`) |
| `volume` | `numeric` | SÍ | 1 | Constante funcional (`1.2`) |
| `instructions` | `text` | SÍ | 1 | Constante funcional (`Manipulación estándar`) |
| `adr` | `jsonb` | NO | 1 | Constante funcional (`{'is_adr': False}`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `issued_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `updated_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `expedition_record_id` | `uuid` | SÍ | 150 | FK referenciada a `expeditions.id` (150 relaciones consistentes) |
| `trip_record_id` | `uuid` | SÍ | 150 | FK referenciada a `trips.id` (150 relaciones consistentes) |
| `sender_party_id` | `uuid` | SÍ | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `recipient_party_id` | `uuid` | SÍ | 150 | FK referenciada a `parties.id` (150 relaciones consistentes) |
| `carrier_party_id` | `uuid` | SÍ | 30 | FK referenciada a `parties.id` (30 relaciones consistentes) |
| `external_document_number` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `sender_instructions` | `text` | SÍ | 1 | Constante funcional (`Sin incidencias`) |
| `carrier_reservations` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `particular_terms` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `carriage_charges` | `jsonb` | NO | 1 | Constante funcional (`{'prepaid': True}`) |
| `cash_on_delivery` | `jsonb` | NO | 1 | Constante funcional (`{'has_cod': False}`) |
| `established_at` | `text` | SÍ | 1 | Constante funcional (`Madrid`) |
| `established_on` | `date` | SÍ | 26 | Distribución de 26 variantes categóricas / numéricas |
| `access_key_expires_at` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `access_key_revoked_at` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `document_kind` | `text` | NO | 1 | Constante funcional (`cmr`) |
| `regulatory_scope` | `text` | SÍ | 1 | Constante funcional (`cmr_convention`) |

### 61. `public.transport_stops`
- **Capa:** L7
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 20

**Claves Foráneas Salientes (Integridad Referencial):**
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `transport_stops_cmr_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `transport_stops_tenant_id_fkey`)
- `trip_stop_id` &rarr; `public.trip_stops(id)` (Constraint: `transport_stops_trip_stop_id_fkey`)
- `address_id` &rarr; `public.party_addresses(id)` (Constraint: `transport_stops_address_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `sequence` | `integer` | NO | 1 | Constante funcional (`1`) |
| `stop_type` | `text` | NO | 1 | Constante funcional (`Recogida`) |
| `company` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `address` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `window_start` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `window_end` | `timestamp with time zone` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `contact_phone` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `latitude` | `numeric` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `longitude` | `numeric` | SÍ | 101 | Distribución de 101 variantes categóricas / numéricas |
| `status` | `text` | NO | 1 | Constante funcional (`Completada`) |
| `arrived_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `completed_at` | `timestamp with time zone` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `trip_stop_id` | `uuid` | SÍ | 150 | FK referenciada a `trip_stops.id` (150 relaciones consistentes) |
| `address_id` | `uuid` | SÍ | 150 | FK referenciada a `party_addresses.id` (150 relaciones consistentes) |
| `contact_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `operational_reference` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |

## Capa Topológica L8 (9 tablas)

### 62. `public.cmr_clauses`
- **Capa:** L8
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 8

**Claves Foráneas Salientes (Integridad Referencial):**
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `cmr_clauses_cmr_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `clause_type` | `text` | NO | 1 | Constante funcional (`particular_term`) |
| `sequence` | `integer` | NO | 1 | Constante funcional (`1`) |
| `text_value` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `source` | `text` | SÍ | 1 | Constante funcional (`TEMPLATE`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 63. `public.cmr_attachments`
- **Capa:** L8
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 9

**Claves Foráneas Salientes (Integridad Referencial):**
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `cmr_attachments_cmr_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `sequence` | `integer` | NO | 1 | Constante funcional (`1`) |
| `document_type` | `text` | NO | 1 | Constante funcional (`ALBARAN`) |
| `title` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `storage_path` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `external_reference` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 64. `public.cmr_parties`
- **Capa:** L8
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 15

**Claves Foráneas Salientes (Integridad Referencial):**
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `cmr_parties_cmr_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `role` | `text` | NO | 1 | Constante funcional (`sender`) |
| `sequence` | `integer` | NO | 1 | Constante funcional (`1`) |
| `customer_id` | `text` | SÍ | 100 | Distribución de 100 variantes categóricas / numéricas |
| `legal_name` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `tax_id` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `address` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `postal_code` | `text` | SÍ | 50 | Distribución de 50 variantes categóricas / numéricas |
| `city` | `text` | SÍ | 49 | Distribución de 49 variantes categóricas / numéricas |
| `country_code` | `text` | SÍ | 1 | Constante funcional (`ES`) |
| `contact_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `contact_phone` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 65. `public.cmr_goods_lines`
- **Capa:** L8
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 24

**Claves Foráneas Salientes (Integridad Referencial):**
- `source_order_line_id` &rarr; `public.order_lines(id)` (Constraint: `cmr_goods_lines_source_order_line_id_fkey`)
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `cmr_goods_lines_cmr_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `sequence` | `integer` | NO | 1 | Constante funcional (`1`) |
| `marks_numbers` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `packages` | `integer` | SÍ | 1 | Constante funcional (`5`) |
| `packaging_code` | `text` | SÍ | 1 | Constante funcional (`PX`) |
| `packaging_description` | `text` | SÍ | 1 | Constante funcional (`Palet`) |
| `goods_description` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `statistical_number` | `text` | SÍ | 1 | Constante funcional (`84713000`) |
| `gross_weight` | `numeric` | SÍ | 1 | Constante funcional (`250.0`) |
| `volume` | `numeric` | SÍ | 1 | Constante funcional (`1.2`) |
| `adr_declared` | `boolean` | NO | 1 | Constante funcional (`False`) |
| `un_number` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `adr_class` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `labels` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `packing_group` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `tunnel_code` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `adr_description` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `source_order_line_id` | `uuid` | SÍ | 150 | FK referenciada a `order_lines.id` (150 relaciones consistentes) |
| `hazmat_snapshot` | `jsonb` | NO | 1 | Constante funcional (`{'is_adr': False}`) |
| `hazmat_edition_code` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |
| `hazmat_input_hash` | `text` | SÍ | 0 | Valor explícito NULL (columna opcional sin impacto) |

### 66. `public.cmr_expeditions`
- **Capa:** L8
- **Clave Primaria:** `cmr_id, expedition_id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 5

**Claves Foráneas Salientes (Integridad Referencial):**
- `expedition_id` &rarr; `public.expeditions(id)` (Constraint: `cmr_expeditions_expedition_id_fkey`)
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `cmr_expeditions_cmr_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `cmr_id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `expedition_id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `sequence` | `integer` | NO | 1 | Constante funcional (`1`) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 67. `public.transport_events`
- **Capa:** L8
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 12

**Claves Foráneas Salientes (Integridad Referencial):**
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `transport_events_cmr_id_fkey`)
- `stop_id` &rarr; `public.transport_stops(id)` (Constraint: `transport_events_stop_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `transport_events_tenant_id_fkey`)
- `actor_user_id` &rarr; `public.auth.users(id)` (Constraint: `transport_events_actor_user_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `stop_id` | `uuid` | SÍ | 150 | FK referenciada a `transport_stops.id` (150 relaciones consistentes) |
| `event_type` | `text` | NO | 4 | Distribución de 4 variantes categóricas / numéricas |
| `occurred_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `latitude` | `numeric` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `longitude` | `numeric` | SÍ | 101 | Distribución de 101 variantes categóricas / numéricas |
| `payload` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `idempotency_key` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `actor_user_id` | `uuid` | SÍ | 1 | FK referenciada a `auth.users.id` (1 relaciones consistentes) |

### 68. `public.cmr_signatures`
- **Capa:** L8
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 16

**Claves Foráneas Salientes (Integridad Referencial):**
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `cmr_signatures_cmr_id_fkey`)
- `stop_id` &rarr; `public.transport_stops(id)` (Constraint: `cmr_signatures_stop_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `stop_id` | `uuid` | SÍ | 150 | FK referenciada a `transport_stops.id` (150 relaciones consistentes) |
| `role` | `text` | NO | 3 | Distribución de 3 variantes categóricas / numéricas |
| `signer_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `signer_document` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `company_name` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `signature_storage_path` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `stamp_storage_path` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `signature_method` | `text` | NO | 1 | Constante funcional (`electronic`) |
| `signed_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `latitude` | `numeric` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `longitude` | `numeric` | SÍ | 101 | Distribución de 101 variantes categóricas / numéricas |
| `device_id` | `text` | SÍ | 150 | 150 valores sintéticos completos y distintos |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

### 69. `public.transport_evidence`
- **Capa:** L8
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 10

**Claves Foráneas Salientes (Integridad Referencial):**
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `transport_evidence_cmr_id_fkey`)
- `stop_id` &rarr; `public.transport_stops(id)` (Constraint: `transport_evidence_stop_id_fkey`)
- `event_id` &rarr; `public.transport_events(id)` (Constraint: `transport_evidence_event_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `transport_evidence_tenant_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `stop_id` | `uuid` | NO | 150 | FK referenciada a `transport_stops.id` (150 relaciones consistentes) |
| `event_id` | `uuid` | SÍ | 150 | FK referenciada a `transport_events.id` (150 relaciones consistentes) |
| `kind` | `text` | NO | 1 | Constante funcional (`pod_photo`) |
| `storage_path` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `captured_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |

### 70. `public.regulatory_document_artifacts`
- **Capa:** L8
- **Clave Primaria:** `id`
- **Filas del Lote:** 150 filas distintas y trazables (`[PRUEBA]`)
- **Total Columnas:** 16

**Claves Foráneas Salientes (Integridad Referencial):**
- `supersedes_artifact_id` &rarr; `public.regulatory_document_artifacts(id)` (Constraint: `regulatory_document_artifacts_supersedes_artifact_id_fkey`)
- `tenant_id` &rarr; `public.tenants(id)` (Constraint: `regulatory_document_artifacts_tenant_id_fkey`)
- `cmr_id` &rarr; `public.cmr_documents(id)` (Constraint: `regulatory_document_artifacts_cmr_id_fkey`)

| Columna | Tipo de Dato | Nulable | Valores Distintos | Estrategia de Cobertura Sintética |
| --- | --- | :---: | :---: | --- |
| `id` | `uuid` | NO | 150 | PK sintética (150 identificadores únicos) |
| `tenant_id` | `uuid` | NO | 1 | FK referenciada a `tenants.id` (1 relaciones consistentes) |
| `cmr_id` | `uuid` | NO | 150 | FK referenciada a `cmr_documents.id` (150 relaciones consistentes) |
| `document_kind` | `text` | NO | 4 | Distribución de 4 variantes categóricas / numéricas |
| `regulatory_scope` | `text` | NO | 4 | Distribución de 4 variantes categóricas / numéricas |
| `version` | `integer` | NO | 1 | Constante funcional (`1`) |
| `mime_type` | `text` | NO | 1 | Constante funcional (`application/pdf`) |
| `storage_path` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `sha256` | `text` | NO | 150 | 150 valores sintéticos completos y distintos |
| `byte_size` | `bigint` | NO | 150 | 150 valores sintéticos completos y distintos |
| `document_created_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `document_modified_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `issued_at` | `timestamp with time zone` | NO | 150 | 150 valores sintéticos completos y distintos |
| `supersedes_artifact_id` | `uuid` | SÍ | 0 | FK referenciada a `regulatory_document_artifacts.id` (0 relaciones consistentes) |
| `metadata` | `jsonb` | NO | 150 | 150 valores sintéticos completos y distintos |
| `created_at` | `timestamp with time zone` | NO | 150 | Marca temporal ISO-8601 de generación de lote |

