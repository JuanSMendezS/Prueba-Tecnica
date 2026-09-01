# Reservas de Canchas Deportivas

Sistema full-stack para reservar canchas deportivas (fútbol, básquet, tenis) centrado en evitar sobreventa y solapamiento de turnos bajo concurrencia.

## Stack

- API: Node.js, TypeScript, Fastify, PostgreSQL.
- Frontend: React, Vite, TypeScript.
- Concurrencia: PostgreSQL `EXCLUDE USING gist` con `tstzrange(start_time, end_time, '[)')` para impedir dos reservas confirmadas del mismo recurso en rangos solapados.
- Infraestructura: Docker Compose.

## Comandos

```bash
npm install
npm run dev
```

`npm run dev` levanta API y frontend en modo desarrollo. Requiere una base PostgreSQL local y `DATABASE_URL` configurado.

```bash
npm run up
```

`npm run up` verifica si las imágenes de Docker ya existen: la primera vez las construye (`docker compose build`) y luego levanta PostgreSQL, API y frontend; en ejecuciones posteriores omite el build y va directo a `docker compose up`. Si necesitas forzar una reconstrucción completa (por ejemplo tras cambiar dependencias), usa:

```bash
npm run up:build
```

- Frontend: http://localhost:5173
- API: http://localhost:3000

Para detener el entorno:

```bash
npm run down
```

## Prueba de concurrencia

Con el entorno corriendo, ejecutar:

```bash
npm run test:concurrency
```

El script dispara 25 solicitudes simultáneas contra el mismo recurso y el mismo horario. El resultado esperado es exactamente 1 respuesta `201 Created` y 24 respuestas `409 Conflict`.

## Cuenta administrador (seed)

Al iniciar, la API crea automáticamente un usuario `ADMIN` si no existe:

- Email: `admin@demo.com`
- Password: `admin123`

Se puede sobrescribir con las variables de entorno `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`. Inicia sesión con esta cuenta para ver el **Panel Admin**: el administrador solo puede visualizar/cancelar reservas y gestionar las canchas (no puede reservar).

## Reglas de negocio

- **Usuario (`USER`):** crea sus propias reservas y puede cancelarlas hasta con 2 horas de anticipación al inicio (validado también en el backend con `400`/`403`).
- **Administrador (`ADMIN`):** ve y cancela todas las reservas, y gestiona las canchas (crear, activar/desactivar, definir cupo y horario). No puede crear reservas (bloqueado también en el backend con `403`).
- **Horario por cancha:** cada cancha tiene `open_hour`/`close_hour` (por defecto 06:00–18:00). El backend rechaza reservas fuera de ese rango.
- **Reserva sin sesión:** cualquiera puede elegir cancha, día y hora; al confirmar sin sesión se pide iniciar sesión/registrarse y, apenas se autentica, la reserva se crea automáticamente con los datos ya seleccionados.

## Interfaz

- **Asistente por pasos:** elegir cancha → elegir día → elegir hora disponible → confirmar. La columna izquierda muestra el historial de reservas del usuario.
- **Panel Admin → Reservas:** todas las reservas del sistema con cancelación.
- **Panel Admin → Espacios:** alta de canchas y edición en línea de cupo, horario de apertura/cierre y estado activo/inactivo.

## Endpoints iniciales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/resources`
- `GET /api/admin/resources` (ADMIN)
- `POST /api/admin/resources` (ADMIN)
- `PATCH /api/admin/resources/:id` (ADMIN)
- `GET /api/reservations/availability?resourceId=&date=`
- `POST /api/reservations`
- `GET /api/reservations/me`
- `DELETE /api/reservations/:id`
- `GET /api/admin/reservations`

## Decisión clave

La garantía fuerte vive en la base de datos, no solo en la aplicación. Aunque dos requests pasen una validación al mismo tiempo, PostgreSQL rechaza el segundo insert que solape un rango confirmado para el mismo recurso, y la API transforma ese error en `409 Conflict`.
