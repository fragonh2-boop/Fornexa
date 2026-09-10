# Verificación transaccional — domicilio FISCAL canónico

Fecha: 10/09/2026  
PR: #64  
Rama: `feat/canonical-fiscal-address`

## Objetivo

Verificar contra el esquema real de Supabase producción que la migración `20260910084703_canonical_fiscal_address.sql` y la RPC `fornexa_upsert_canonical_fiscal_address` son ejecutables, conservan un único domicilio FISCAL canónico y registran la auditoría en la misma transacción, sin persistir datos de prueba.

## Precondiciones verificadas

Antes de las pruebas se confirmó en producción:

- 0 filas con `address_type='FISCAL'`;
- 0 filas con `code='FISCAL'`;
- ausencia del nuevo índice parcial `party_addresses_one_active_fiscal_per_party_idx`;
- ausencia de la nueva RPC;
- existencia del índice UNIQUE previo `party_addresses_tenant_id_party_id_code_key` sobre `(tenant_id, party_id, code) NULLS NOT DISTINCT`.

Ese índice previo impide estructuralmente que una misma empresa tenga dos filas con `code='FISCAL'`, estén activas o inactivas.

## Primera ejecución y defecto detectado

La primera ejecución real de la RPC, dentro de `BEGIN ... ROLLBACK`, detectó un error PostgreSQL `42702` por una referencia ambigua a `id`. La causa era la colisión entre las columnas de salida de `RETURNS TABLE(id, ...)` y columnas no cualificadas dentro de PL/pgSQL.

Se corrigió la migración cualificando las relaciones y columnas relevantes (`public.parties AS p`, `public.party_addresses AS pa`, `p.id`, `pa.id`, `RETURNING pa.*`). El fix quedó versionado en el commit `356001ec6ec2aae7b352caf3470acfeadb686bc8` y protegido posteriormente por una regresión de fuente.

## Refuerzo del invariant FISCAL

Tras la revisión independiente se reforzó también la relación código/tipo para eliminar estados mixtos de legado o escritura directa:

```sql
check ((code is not distinct from 'FISCAL') = (address_type = 'FISCAL'))
```

La migración hace además un preflight equivalente y aborta antes de crear objetos si encuentra datos incompatibles. Por tanto:

- `code='FISCAL'` exige `address_type='FISCAL'`;
- `address_type='FISCAL'` exige `code='FISCAL'`;
- combinado con la UNIQUE productiva existente `(tenant_id, party_id, code)`, solo puede existir una fila canónica FISCAL total por empresa;
- el índice parcial adicional protege explícitamente la cardinalidad de FISCAL activos.

## Verificación final posterior al hardening

Se repitió el flujo completo con el DDL reforzado dentro de una única transacción explícita:

1. `BEGIN`.
2. Ejecución del DDL de la migración.
3. Primera llamada a `fornexa_upsert_canonical_fiscal_address` con un domicilio sintético.
4. Segunda llamada sobre la misma empresa con una dirección sintética distinta.
5. Comprobaciones SQL dentro de la transacción.
6. `ROLLBACK`.
7. Comprobaciones SQL posteriores al rollback.

Resultados dentro de la transacción:

- `active_fiscal_rows = 1`;
- `canonical_fiscal_rows = 1`;
- `audit_rows = 2` (`CREATE_FISCAL` + `UPDATE_FISCAL`);
- la segunda llamada actualizó la fila canónica existente;
- el valor final observado correspondía a la segunda dirección sintética.

Resultados posteriores al `ROLLBACK`:

- `fiscal_rows_after_rollback = 0`;
- `reserved_rows_after_rollback = 0`;
- `party_addresses_one_active_fiscal_per_party_idx` inexistente;
- `fornexa_upsert_canonical_fiscal_address(...)` inexistente.

Por tanto, la prueba no dejó domicilio, índice, constraint ni RPC persistidos en producción.

## Invariantes cubiertos

- Compatibilidad real de la migración con el esquema productivo actual.
- Ejecución real de la RPC tras corregir la ambigüedad PL/pgSQL.
- Una única fila FISCAL canónica después de create + update.
- Código y tipo FISCAL ligados bidireccionalmente.
- Auditoría ligada a la misma operación transaccional.
- Rollback completo de datos y DDL de prueba.
- UNIQUE productiva existente `(tenant_id, party_id, code)` como protección estructural del código reservado `FISCAL`.

## Alcance

Esta evidencia valida el camino secuencial create/update y la atomicidad observada en una transacción controlada. La serialización concurrente se sustenta además en el bloqueo `FOR UPDATE` de la fila `parties` y en los índices únicos de base de datos; no se ejecutó una prueba de carrera multisesión dentro de este gate.

No se aplicó la migración a producción como parte de esta verificación y no se emitió ningún DeCA real.
