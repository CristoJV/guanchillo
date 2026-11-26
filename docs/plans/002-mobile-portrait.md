# Plan 002 · Adaptación a móvil vertical

El objetivo es seguir un patrón con una mano libre o con un ratón o teclado accionado con el pie. En un teléfono, el orden de lectura será navegación, progreso, ventana del patrón y mensaje. La aplicación conserva el editor, el catálogo y el formato JSON v1.

## Fase 1 · Seguimiento y controles

1. Organizar el código por funciones. El modelo de patrones, las esferas, el cálculo de colores y la ruta de tejido son comunes. La vista de escritorio conserva el gráfico completo. La vista móvil consume el mismo progreso y presenta la fila o vuelta actual con hasta ocho puntos.
2. Calcular el tramo visible a partir del punto activo y del sentido de trabajo. Desplazarlo al avanzar o retroceder, respetando los extremos de la fila y las vueltas de una esfera. Marcar el punto activo y los completados. Mostrar porcentaje y puntos terminados encima del tramo.
3. Mantener un mensaje visible con los puntos del color actual y el color con el que se debe cerrar el punto de cambio. Incluir las instrucciones de aumento, disminución y cierre en esferas. Permitir configurar fila o vuelta, columna y dirección desde el botón de ajustes de la cabecera.
4. Admitir un toque o clic en el área de tejido y mantener los botones de avance y retroceso. Permitir asignar una tecla o botón de ratón por acción y restaurar cada valor predeterminado. Ignorar las teclas mantenidas, los gestos de arrastre y las pulsaciones sobre navegación, controles y diálogos. Conservar el salto al punto pulsado en el gráfico de escritorio.
5. Guardar las asignaciones como preferencias locales. El mismo patrón debe poder cambiar de vista, continuar tras recargar y conservar su progreso al exportar e importar.

**Checkpoint.** Probar ventanas estrechas y anchas, ambos sentidos, cambio de fila, esferas, cambio de color y finalización. Verificar controles predeterminados y personalizados, captura, conflictos, áreas excluidas y recuperación después de recargar. Comprobar la continuidad con archivos JSON v1.

## Fase 2 · Editor, catálogo y entrega

1. Dar prioridad al gráfico, la barra de herramientas y la paleta en móvil. Plegar los controles de configuración secundaria y presentar los formularios en una columna cuando sea necesario. Verificar pintura táctil, zoom, deshacer y acceso a tamaño, importación y exportación.
2. Renombrar Collection a Catalog y disponer exactamente una tarjeta por fila en teléfonos. Conservar el filtro por tipo y simplificar las etiquetas temáticas. Agrupar con una sola etiqueta cuando ayude a encontrar varios patrones relacionados. Admitir varias solo cuando cada una aporte una búsqueda concreta e independiente.
3. Reconciliar el índice con los archivos que siguen en la carpeta y añadir las siete cartas de Minecraft suministradas, conservando sus celdas y colores. Validar que el índice y los archivos coinciden y que se aplican las etiquetas previstas.
4. Ejecutar comprobaciones unitarias y de navegador en vistas verticales estrechas y en escritorio. Actualizar la guía de usuario y de arquitectura. Revisar el diff, crear el commit y publicar en `origin/main`.

**Checkpoint.** El editor y el catálogo caben en una pantalla de 320 px de ancho sin desbordamiento horizontal. El filtro Minecraft muestra siete tarjetas con sus variantes de color. El sitio compilado funciona por HTTP, incluyendo sus rutas relativas, y se mantienen los atajos de escritorio y el progreso guardado.

## Verificación de entrega

- Fase 1 verificada con pruebas unitarias del recorrido y de las asignaciones, y pruebas en Chromium del seguimiento táctil, los controles de pie y el intercambio de progreso JSON v1.
- Fase 2 verificada con el editor a 320 px, el catálogo de una columna y siete fichas de Minecraft. Se compararon las celdas y los valores hexadecimales de los siete patrones publicados con los archivos adjuntos. El catálogo final tiene 34 patrones.
