# Sistema de Reservas

Base full-stack para una prueba técnica centrada en evitar sobreventa y solapamiento de reservas bajo concurrencia.

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

`npm run up` construye y deja corriendo PostgreSQL, API y frontend con Docker Compose.

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
