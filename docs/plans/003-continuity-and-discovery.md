# Plan 003 · Continuidad del tejido y descubrimiento de patrones

## Hallazgos del Plan 2

- En móvil, corregir varios puntos obliga a pulsar atrás repetidamente o a reiniciar el punto de partida. Si se apaga la pantalla, la indicación deja de estar a la vista durante el tejido.
- La biblioteca muestra el tamaño y la paleta, pero abrir un proyecto depende del modo actual y el progreso solo aparece después de abrirlo. El catálogo y la biblioteca carecen de búsqueda por nombre.
- El catálogo dibuja todas las vistas previas al abrirse, incluidas las que quedan fuera de pantalla. El editor guarda un trazo aunque el dispositivo cancele el gesto. Una compilación local puede conservar módulos que ya no existen en el código fuente.

## Fase 1 · Seguir el proyecto y corregir el punto actual

1. Añadir **Go to stitch** en los ajustes de tejido. Seleccionar el próximo punto por fila o vuelta y número de punto en el sentido de trabajo, igual que en el seguimiento. Limitar la selección a la ruta activa y conservar el punto de partida, la dirección y la alternancia. Mantener disponible el salto con clic en el gráfico de escritorio.
2. Añadir un ajuste voluntario para mantener la pantalla encendida. Solicitarlo solo en Crochet con la página visible y puntos pendientes, soltarlo al salir, y comunicar cuando el dispositivo no lo concede.
3. Mostrar el progreso en **My patterns** y ofrecer acciones explícitas para tejer, editar y exportar cada proyecto. Exportar el JSON v1 de la fila elegida con su progreso, sin cambiar el proyecto abierto.

**Checkpoint.** Cambiar de punto en un patrón plano y uno esférico, verificar que se guarda la misma ruta al recargar y exportar, y probar la activación, liberación y denegación de la pantalla activa. Abrir y exportar un proyecto distinto del seleccionado desde la biblioteca.

## Fase 2 · Búsqueda y previsualizaciones

1. Añadir búsqueda por nombre en biblioteca y catálogo. Aceptar mayúsculas, tildes y varias palabras en cualquier orden. En el catálogo combinar la búsqueda con tema y tipo, y ofrecer un reinicio de filtros.
2. Dibujar vistas previas cuando se acercan a la zona visible. Conservar la selección de colores y resolución de cada tarjeta. Permitir abrir la variante elegida desde el teclado incluso antes de que se dibuje.
3. Mantener una tarjeta por fila en móvil, resultados anunciados y controles accesibles con teclado.

**Checkpoint.** Buscar nombres con tilde desde un móvil de 320 px, combinar filtros, recuperar la lista completa y abrir una variante fuera de pantalla. Verificar que las vistas se dibujan al desplazarse por el catálogo.

## Fase 3 · Gestos y entrega

1. Tratar un trazo táctil cancelado como una edición descartada. Restaurar las celdas y la vista previa y conservar el historial previo. Permitir cancelar un trazo o un desplazamiento de referencia con Escape.
2. Limpiar los módulos compilados al reconstruir el sitio y copiar los recursos estáticos conservando sus rutas. Verificar los archivos publicados y servir `dist/` bajo el prefijo de un sitio de proyecto.
3. Ejecutar las comprobaciones de tipos, pruebas unitarias y pruebas de navegador sobre la compilación final. Actualizar las guías con las nuevas acciones y decisiones de compatibilidad.

**Checkpoint.** Comprobar cancelación de puntero, deshacer y rehacer, controles de teclado y táctiles, y eliminación de archivos obsoletos del directorio de publicación.

Las funciones candidatas que requieren otro diseño incluyen copias de toda la biblioteca, sincronización entre dispositivos y uso sin conexión. Los cambios de este plan se apoyan en el almacenamiento local y en el intercambio de archivos JSON v1.

## Verificación de entrega

- Fase 1. Chromium verificó la corrección de la ruta en patrones planos y esféricos, la reanudación tras recargar, la exportación JSON v1 y las acciones de biblioteca. La prueba de pantalla activa simuló la concesión y denegación del navegador y comprobó la liberación al ocultar la página, salir de Crochet o terminar el patrón.
- Fase 2. Chromium comprobó la combinación de búsqueda y filtros a 320 px, la carga diferida de previsualizaciones y la apertura por teclado de una variante antes de que se dibuje.
- Fase 3. Chromium comprobó la cancelación de un toque, de un trazo con Escape y del movimiento de una referencia. Se verificó que una nueva compilación elimina un módulo obsoleto de prueba y que los archivos compilados se sirven por HTTP bajo `/guanchillo/`. Pasaron 32 pruebas unitarias y 12 de navegador.
