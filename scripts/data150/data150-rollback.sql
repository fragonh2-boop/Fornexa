-- FORNEXA — DATA150 OPERATIONAL ROLLBACK STUB (FAIL-CLOSED)
-- ==============================================================================
-- ADVERTENCIA DE SEGURIDAD ESTRICTA:
-- Este archivo NO contiene claves previstas ni SQL ejecutable estático.
-- El procedimiento operativo vinculante exige generar el rollback EXCLUSIVAMENTE
-- tras una ejecución confirmada consumiendo el recibo durable de ejecución real:
--   node --experimental-strip-types scripts/data150/generate_rollback_from_receipt.ts
-- Cualquier intento de ejecutar este archivo antes de la generación dinámica
-- abortará inmediatamente la transacción con una excepción.
-- ==============================================================================

DO $$
BEGIN
  RAISE EXCEPTION 'SEGURIDAD FAIL-CLOSED: No existe rollback dinámico generado. Ejecute scripts/data150/generate_rollback_from_receipt.ts a partir del recibo COMMITTED.';
END $$;
