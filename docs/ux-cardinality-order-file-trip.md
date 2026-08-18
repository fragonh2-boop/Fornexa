# FORNEXA — UX de cardinalidades Pedido / Albarán / Expediente / Viaje / Documento

## Principio
No duplicar filas padre para representar relaciones 1:N. Cada listado mantiene una fila por la entidad que el usuario está gestionando y muestra la cardinalidad relacionada mediante contadores, estado actual y drill-down.

## Pedido
Una fila = un pedido. Mostrar `N albaranes · 1 expediente` como resumen cuando el expediente ya exista. En ficha, usar una tabla hija de albaranes y un acceso directo al único expediente asociado. Evitar repetir el pedido N veces: perjudica totales, filtros y lectura comercial.

## Albarán
Representa una recogida/documento operativo perteneciente al pedido. Un pedido puede tener varios albaranes y todos consolidan en el mismo expediente del pedido. En UX puede mostrarse como referencia vinculada y no necesita necesariamente un módulo principal independiente en navegación.

## Expediente
Una fila = un expediente. Es el hilo conductor operativo único del pedido. Mostrar pedido, `N albaranes`, ruta global y `N viajes · actual VJ-...`. En ficha, los albaranes consolidan las distintas recogidas del mismo pedido y los viajes deben verse como secuencia/itinerario ordenado (tramos), no como simples etiquetas. Cada tramo conserva transportista, vehículo, fechas y estado.

## Viaje
Una fila = un viaje físico. Mostrar `N expedientes` y carga/capacidad agregada. En ficha, tabla hija de expedientes transportados en ese tramo. El viaje no absorbe la identidad del expediente.

## CMR / carta de porte
Una fila = un documento. Mostrar `N expedientes` y el viaje/tramo documental cuando corresponda. La ficha permite desplegar los expedientes fuente. El documento es una proyección versionada; no es el maestro de los datos operativos.

## Patrones comunes
- Badge/contador para cardinalidad en grids (`3 albaranes`, `2 viajes`).
- Mostrar además la relación operacionalmente relevante (`actual VJ-260052`) para evitar un clic cuando el usuario solo necesita saber dónde está ahora.
- Drill-down mediante fila/ficha para ver todos los hijos.
- Timeline únicamente donde el orden es semántico: viajes/tramos de un expediente.
- Tablas hijas donde el orden no es el concepto principal: albaranes de pedido/expediente, expedientes de viaje, expedientes de CMR.
- No usar acordeones dentro de grids principales: complican ordenación, filtrado, altura de filas y personalización de columnas.
- Las columnas relacionales participan en búsqueda/filtro y pueden ocultarse con el selector genérico de columnas.

## Modelo de datos
Pedido 1:N Albaranes. Pedido 1:1 Expediente. Los distintos albaranes (recogidas separadas) de un pedido consolidan en ese único expediente. Expediente N:M Viaje mediante secuencia de tramos. CMR N:M Expediente. Esta última N:M permite varios documentos a lo largo de distintos tramos sin destruir la identidad del expediente.

### Invariante de implementación
`expeditions.order_id` es la relación única canónica Pedido↔Expediente. Un pedido no puede estar en diferentes expedientes. La unicidad se fuerza mediante el índice parcial `expeditions_order_id_unique_idx` sobre `expeditions(order_id) WHERE order_id IS NOT NULL`. `expedition_delivery_notes` consolida los distintos albaranes del pedido en ese mismo expediente; no debe existir una unicidad que fuerce un expediente distinto por albarán. La corrección definitiva está registrada en `20260818_restore_order_expedition_1to1`.
