# Pendiente — CMR A4 sin clipping silencioso

Estado: PREPRODUCCIÓN.

Riesgo: PR #60 fijó correctamente la geometría A4, pero `height/max-height: 279mm` junto con `overflow:hidden` podía truncar silenciosamente contenido real extenso.

Corrección preparada: conservar 192 mm de ancho y 279 mm como mínimo, permitir altura automática/paginación y evitar cortes internos de bloques documentales relevantes.

Cierre requerido: CI + Preview exact-head, revisión Claude/DeepSeek sin MUST, evidencia visual con contenido extremo, merge y verificación productiva.
