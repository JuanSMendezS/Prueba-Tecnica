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

Se puede sobrescribir con las variables de entorno `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`. Inicia sesión con esta cuenta para ver el botón **Panel Admin**, que lista todas las reservas (de cualquier usuario) y permite cancelarlas.

## Interfaz

- **Disponibilidad del día:** grilla de bloques horarios (08:00–20:00) por recurso y fecha, en verde (libre) o rojo (ocupado). Al hacer clic en un bloque libre se prellena el formulario de reserva.
- **Mis reservas:** listado personal con opción de cancelar.
- **Panel Admin:** solo visible para el rol `ADMIN`, muestra todas las reservas del sistema con usuario, recurso, estado y cancelación.

## Endpoints iniciales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/resources`
- `GET /api/reservations/availability?resourceId=&date=`
- `POST /api/reservations`
- `GET /api/reservations/me`
- `DELETE /api/reservations/:id`
- `GET /api/admin/reservations`

## Decisión clave

La garantía fuerte vive en la base de datos, no solo en la aplicación. Aunque dos requests pasen una validación al mismo tiempo, PostgreSQL rechaza el segundo insert que solape un rango confirmado para el mismo recurso, y la API transforma ese error en `409 Conflict`.
