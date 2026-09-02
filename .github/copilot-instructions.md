# Instrucciones para GitHub Copilot

Este es el equivalente a `.cursorrules` pero para Copilot: reglas de contexto que debe respetar cualquier sugerencia o cambio de código en este repo.

## Dominio

Sistema de reservas de canchas deportivas (fútbol, básquet, tenis). Roles: `USER` (crea y cancela sus propias reservas) y `ADMIN` (ve/cancela todas las reservas y gestiona las canchas: alta, cupo, horario de apertura/cierre, activar/desactivar). El admin **no** puede crear reservas.

## Regla no negociable: cero doble reserva

- La garantía fuerte vive en PostgreSQL, no en la aplicación: constraint `EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&) WHERE (status = 'CONFIRMED')` en `reservations` ([db.ts](../apps/api/src/db.ts)).
- La API además usa transacción `BEGIN ISOLATION LEVEL SERIALIZABLE` al insertar y traduce el error de exclusión de Postgres (`23P01`) a `409 Conflict`.
- Nunca reemplazar esta validación por un simple "check-then-insert" en JS; el constraint de BD es la última línea de defensa ante condiciones de carrera.
- Cualquier cambio en el modelo de reservas debe mantener/actualizar este constraint y el script `apps/api/scripts/concurrency-test.ts`, que valida 1 éxito y N-1 conflictos con N peticiones simultáneas.

## Reglas de negocio vigentes

- Reservas: exactamente 1 hora de duración, deben iniciar en punto (`:00`), dentro del horario `open_hour`/`close_hour` de la cancha, y no en el pasado.
- Cancelación: `USER` solo puede cancelar sus propias reservas con ≥2 horas de anticipación (`CANCELLATION_WINDOW_HOURS`); `ADMIN` puede cancelar cualquiera sin restricción.
- Todas las fechas se manejan en UTC en el backend (`timestamptz`); el frontend convierte a/desde hora local solo para mostrar.

## Convenciones técnicas

- Backend: Node.js + TypeScript + Fastify + `pg` + Zod para validación de payloads. Sin ORM.
- Frontend: React + Vite + TypeScript, un solo componente `App` en `apps/web/src/main.tsx` (sin router ni librería de estado externa), estilos planos en `styles.css` (sin degradados, paleta de una sola tonalidad).
- CORS: `@fastify/cors` debe registrarse con `methods` explícitos incluyendo `PATCH`/`DELETE` (el default de la librería no siempre los incluye).
- El content-type parser JSON del backend tolera body vacío (necesario porque `fetch` en el navegador puede mandar `content-type: application/json` en `DELETE` sin body).
- Migraciones: `migrate()` en `db.ts` usa `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para cambios incrementales (no hay sistema de migraciones versionado).
- Docker Compose expone healthchecks; el de `api` debe usar `127.0.0.1` (no `localhost`) porque Alpine puede resolver `localhost` a `::1` y romper el healthcheck aunque el server esté sano.

## Al proponer cambios

- Si tocas el modelo de reservas o el endpoint `POST /api/reservations`, vuelve a correr `npm run test:concurrency` antes de dar por válido el cambio.
- Si agregas un endpoint que muta datos (`POST`/`PATCH`/`DELETE`), confirma que el registro de CORS siga permitiendo ese método.
- Prioriza mensajes de error accionables en español para el usuario final (es el idioma de toda la UI).
