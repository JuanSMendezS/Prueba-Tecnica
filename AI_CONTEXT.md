# AI_CONTEXT

> Nota: este proyecto se guio con **GitHub Copilot** (Claude Sonnet 4.5 vía Copilot Chat, modo agente). El archivo equivalente a `.cursorrules` para Copilot es [.github/copilot-instructions.md](.github/copilot-instructions.md); este documento explica cómo se llegó a esas reglas y el hilo de prompts/decisiones durante el desarrollo.

## Objetivo usado para construir la base

Crear una aplicación de reservas de canchas deportivas donde el criterio principal sea demostrar cero doble reserva ante condiciones de carrera.

## Prompts principales y cómo se guio a la IA

El desarrollo se hizo en una sola conversación iterativa con Copilot, en orden aproximado:

1. **Base del sistema (arquitectura y concurrencia primero):** se pidió priorizar el modelo de datos, las transacciones y la validación de concurrencia por encima del diseño visual, usando PostgreSQL como autoridad de integridad (`EXCLUDE USING gist` + `tstzrange`), dejar un único comando para levantar todo (`docker-compose`) e incluir una prueba automatizada de condición de carrera.
2. **Revisión funcional contra el enunciado de la prueba:** se le pidió a la IA revisar el proyecto ya generado contra el checklist de requerimientos (autenticación/roles, motor de reservas, prevención de solapamiento, calendario interactivo) y proponer/implementar las brechas encontradas: panel de administrador real (ver/cancelar todas las reservas, gestionar canchas), calendario de disponibilidad visual (verde/ocupado), en vez de solo un formulario de fecha/hora libre.
3. **Ajuste de contexto y diseño:** se pidió reencuadrar el dominio explícitamente a "canchas deportivas" (nombres de recursos, textos de UI) y aplanar la paleta de colores (sin degradados, una sola tonalidad, nada llamativo), priorizando funcionalidad sobre estética.
4. **Reglas de negocio afinadas mediante correcciones sucesivas del usuario:** el admin no reserva, solo cancela y gestiona canchas; el usuario reserva y puede cancelar con ≥2 horas de anticipación; horario de apertura/cierre configurable por cancha (default 6–18); duración fija de 1 hora, inicio en punto.
5. **Flujo de reserva sin sesión:** se pidió que un usuario no autenticado pudiera elegir cancha/día/hora y que, al confirmar, se le pidiera iniciar sesión y la reserva se creara inmediatamente tras autenticarse (sin perder la selección).
6. **Rediseño de layout tipo asistente:** historial de reservas en la columna izquierda, flujo por pasos (cancha → día → hora) en la derecha, para dar más espacio a la creación de la reserva.
7. **Verificación exhaustiva con checklist propio:** se le pidió a la IA validar el proyecto contra un checklist de casos de prueba (solapamiento exacto/parcial/envolvente/adyacente, condición de carrera con N peticiones simultáneas, timezones UTC, granularidad de duración, estados visuales de disponibilidad, estados de carga) ejecutando pruebas reales contra la API viva en Docker, no solo revisando código.
8. **Depuración guiada por síntomas reportados por el usuario, no por hipótesis:** varios bugs reales se encontraron así (healthcheck de Docker fallando por `localhost` resolviendo a `::1` en Alpine; `event.currentTarget` nulificado tras un `await` en React; CORS bloqueando `DELETE`/`PATCH` porque `@fastify/cors` no traía esos métodos por defecto; Fastify rechazando `DELETE` sin body cuando el `content-type` decía `application/json`). En cada caso se le pidió a la IA reproducir el error con una petición real antes de "arreglarlo a ciegas".

## Decisiones técnicas clave (y por qué)

- **Constraint de base de datos como última línea de defensa:** aunque la API valida solapamiento en la capa de aplicación, la garantía real de cero doble reserva es el `EXCLUDE USING gist` en Postgres dentro de una transacción `SERIALIZABLE`. Se verificó explícitamente que ningún cambio posterior reemplazara esto por un simple "check-then-insert".
- **Sin ORM:** Fastify + `pg` directo con SQL parametrizado, para mantener visibilidad total sobre las queries de concurrencia.
- **Un solo componente de frontend (`App`):** sin router ni librería de estado externa, dado el alcance acotado de la prueba técnica.
- **CORS y content-type explícitos:** se descubrieron durante las pruebas dos configuraciones por defecto de librerías (Fastify/`@fastify/cors`) que rompían silenciosamente `DELETE`/`PATCH` desde el navegador; quedaron documentadas en las instrucciones para no repetir el error.

## Validaciones aplicadas

- Compilación TypeScript de la API y del frontend antes de cada reconstrucción de contenedores.
- Script `npm run test:concurrency` (25 peticiones simultáneas) ejecutado repetidamente tras cada cambio relevante al modelo de reservas, exigiendo 1 éxito y `N-1` conflictos.
- Pruebas manuales contra la API real corriendo en Docker (no solo revisión de código) para cada regla de negocio nueva: solapamiento exacto/parcial/envolvente/adyacente, restricción horaria por cancha, ventana de cancelación de 2 horas, bloqueo de reservas para `ADMIN`, y reproducción exacta de bugs de CORS/`content-type` antes y después del fix.
- Criterio de aceptación: cualquier cambio que tocara `POST /api/reservations` o el modelo de `reservations` debía volver a pasar la prueba de concurrencia antes de darse por válido.

