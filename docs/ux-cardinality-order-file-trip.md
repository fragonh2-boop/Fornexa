# FORNEXA — UX de cardinalidades Pedido / Albarán / Expediente / Viaje / Documento

## Principio
No duplicar filas padre para representar relaciones 1:N. Cada listado mantiene una fila por la entidad que el usuario está gestionando y muestra la cardinalidad relacionada mediante contadores, estado actual y drill-down.

## Pedido
Una fila = un pedido. Mostrar `N albaranes · N expedientes` como resumen. En ficha, usar una tabla hija Albaranes/Expedientes con estado operativo. Evitar repetir el pedido N veces: perjudica totales, filtros y lectura comercial.

## Albarán
Es el puente determinista entre pedido y expediente. Relación 1:1 con expediente. En UX puede mostrarse como referencia vinculada y no necesita necesariamente un módulo principal independiente en navegación.

## Expediente
Una fila = un expediente. Es el hilo conductor operativo. Mostrar pedido, albarán, ruta global y `N viajes · actual VJ-...`. En ficha, los viajes deben verse como secuencia/itinerario ordenado (tramos), no como simples etiquetas. Cada tramo conserva transportista, vehículo, fechas y estado.

## Viaje
Una fila = un viaje físico. Mostrar `N expedientes` y carga/capacidad agregada. En ficha, tabla hija de expedientes transportados en ese tramo. El viaje no absorbe la identidad del expediente.

## CMR / carta de porte
Una fila = un documento. Mostrar `N expedientes` y el viaje/tramo documental cuando corresponda. La ficha permite desplegar los expedientes fuente. El documento es una proyección versionada; no es el maestro de los datos operativos.

## Patrones comunes
- Badge/contador para cardinalidad en grids (`3 expedientes`, `2 viajes`).
- Mostrar además la relación operacionalmente relevante (`actual VJ-260052`) para evitar un clic cuando el usuario solo necesita saber dónde está ahora.
- Drill-down mediante fila/ficha para ver todos los hijos.
- Timeline únicamente donde el orden es semántico: viajes/tramos de un expediente.
- Tablas hijas donde el orden no es el concepto principal: albaranes de pedido, expedientes de viaje, expedientes de CMR.
- No usar acordeones dentro de grids principales: complican ordenación, filtrado, altura de filas y personalización de columnas.
- Las columnas relacionales participan en búsqueda/filtro y pueden ocultarse con el selector genérico de columnas.

## Modelo de datos
Pedido 1:N Albaranes. Albarán 1:1 Expediente. Expediente N:M Viaje mediante secuencia de tramos. CMR N:M Expediente. Esta última N:M permite varios documentos a lo largo de distintos tramos sin destruir la identidad del expediente.

### Invariante de implementación
`expeditions.order_id` es un vínculo denormalizado para consulta y validación, **no** una relación única. La unicidad se aplica en `expedition_delivery_notes.delivery_note_id`: un albarán pertenece a un solo expediente, mientras que un pedido puede originar varios expedientes mediante sus distintos albaranes. La migración correctiva `20260818_fix_order_expedition_cardinality` sustituye la restricción 1:1 Pedido↔Expediente introducida temporalmente el 17/08/2026.
