import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import Fastify from 'fastify';
import { z } from 'zod';
import { requireAuth, signToken } from './auth.js';
import { migrate, pool } from './db.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

app.get('/health', async () => ({ ok: true }));

app.post('/api/auth/register', async (request, reply) => {
  const body = credentialsSchema.extend({ name: z.string().min(2) }).parse(request.body);
  const passwordHash = await bcrypt.hash(body.password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, role`,
      [body.name, body.email.toLowerCase(), passwordHash]
    );
    const user = result.rows[0];
    return reply.code(201).send({ token: signToken(user), user });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return reply.code(409).send({ message: 'El email ya está registrado' });
    }
    throw error;
  }
});

app.post('/api/auth/login', async (request, reply) => {
  const body = credentialsSchema.parse(request.body);
  const result = await pool.query('SELECT id, email, role, password_hash FROM users WHERE email = $1', [
    body.email.toLowerCase()
  ]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    return reply.code(401).send({ message: 'Credenciales inválidas' });
  }

  return { token: signToken({ id: user.id, email: user.email, role: user.role }), user: { id: user.id, email: user.email, role: user.role } };
});

app.get('/api/resources', async () => {
  const result = await pool.query(
    'SELECT id, name, capacity, active, open_hour, close_hour FROM resources WHERE active = true ORDER BY name'
  );
  return result.rows;
});

app.get('/api/admin/resources', { preHandler: requireAuth }, async (request, reply) => {
  if (request.user?.role !== 'ADMIN') {
    return reply.code(403).send({ message: 'Requiere rol ADMIN' });
  }
  const result = await pool.query(
    'SELECT id, name, capacity, active, open_hour, close_hour FROM resources ORDER BY name'
  );
  return result.rows;
});

app.post('/api/admin/resources', { preHandler: requireAuth }, async (request, reply) => {
  if (request.user?.role !== 'ADMIN') {
    return reply.code(403).send({ message: 'Requiere rol ADMIN' });
  }
  const body = z.object({
    name: z.string().min(2),
    capacity: z.number().int().positive(),
    openHour: z.number().int().min(0).max(23).default(6),
    closeHour: z.number().int().min(1).max(24).default(18)
  }).refine((value) => value.closeHour > value.openHour, { message: 'closeHour debe ser mayor que openHour' }).parse(request.body);

  try {
    const result = await pool.query(
      `INSERT INTO resources (name, capacity, open_hour, close_hour)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, capacity, active, open_hour, close_hour`,
      [body.name, body.capacity, body.openHour, body.closeHour]
    );
    return reply.code(201).send(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return reply.code(409).send({ message: 'Ya existe una cancha con ese nombre' });
    }
    throw error;
  }
});

app.patch('/api/admin/resources/:id', { preHandler: requireAuth }, async (request, reply) => {
  if (request.user?.role !== 'ADMIN') {
    return reply.code(403).send({ message: 'Requiere rol ADMIN' });
  }
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const body = z.object({
    name: z.string().min(2).optional(),
    capacity: z.number().int().positive().optional(),
    active: z.boolean().optional(),
    openHour: z.number().int().min(0).max(23).optional(),
    closeHour: z.number().int().min(1).max(24).optional()
  }).parse(request.body);

  const result = await pool.query(
    `UPDATE resources
     SET name = COALESCE($2, name),
         capacity = COALESCE($3, capacity),
         active = COALESCE($4, active),
         open_hour = COALESCE($5, open_hour),
         close_hour = COALESCE($6, close_hour)
     WHERE id = $1
     RETURNING id, name, capacity, active, open_hour, close_hour`,
    [params.id, body.name, body.capacity, body.active, body.openHour, body.closeHour]
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ message: 'Cancha no encontrada' });
  }
  if (result.rows[0].close_hour <= result.rows[0].open_hour) {
    return reply.code(400).send({ message: 'closeHour debe ser mayor que openHour' });
  }
  return result.rows[0];
});

app.get('/api/reservations/availability', async (request) => {
  const query = z.object({ resourceId: z.string().uuid(), date: z.string().date() }).parse(request.query);
  const result = await pool.query(
    `SELECT id, start_time, end_time
     FROM reservations
     WHERE resource_id = $1
       AND status = 'CONFIRMED'
       AND start_time >= ($2::date AT TIME ZONE 'UTC')
       AND start_time < (($2::date + interval '1 day') AT TIME ZONE 'UTC')
     ORDER BY start_time`,
    [query.resourceId, query.date]
  );
  return result.rows;
});

app.post('/api/reservations', { preHandler: requireAuth }, async (request, reply) => {
  if (request.user?.role !== 'USER') {
    return reply.code(403).send({ message: 'El administrador no puede crear reservas' });
  }
  const body = z.object({
    resourceId: z.string().uuid(),
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true })
  }).parse(request.body);
  const start = new Date(body.startTime);
  const end = new Date(body.endTime);

  if (start >= end || start < new Date()) {
    return reply.code(400).send({ message: 'Rango horario inválido' });
  }

  const resourceResult = await pool.query(
    'SELECT open_hour, close_hour FROM resources WHERE id = $1 AND active = true',
    [body.resourceId]
  );
  const resource = resourceResult.rows[0];
  if (!resource) {
    return reply.code(404).send({ message: 'Cancha no encontrada' });
  }

  const dayStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), resource.open_hour, 0, 0));
  const dayEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), resource.close_hour, 0, 0));
  if (start < dayStart || end > dayEnd) {
    return reply.code(400).send({
      message: `La cancha solo admite reservas entre las ${String(resource.open_hour).padStart(2, '0')}:00 y las ${String(resource.close_hour).padStart(2, '0')}:00`
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    const result = await client.query(
      `INSERT INTO reservations (resource_id, user_id, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       RETURNING id, resource_id, user_id, start_time, end_time, status`,
      [body.resourceId, request.user?.id, start.toISOString(), end.toISOString()]
    );
    await client.query('COMMIT');
    return reply.code(201).send(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23P01') {
      return reply.code(409).send({ message: 'El horario ya fue tomado por otra reserva' });
    }
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/reservations/me', { preHandler: requireAuth }, async (request) => {
  const result = await pool.query(
    `SELECT r.id, r.start_time, r.end_time, r.status, res.name AS resource_name
     FROM reservations r
     JOIN resources res ON res.id = r.resource_id
     WHERE r.user_id = $1
     ORDER BY r.start_time DESC`,
    [request.user?.id]
  );
  return result.rows;
});

app.delete('/api/reservations/:id', { preHandler: requireAuth }, async (request, reply) => {
  if (request.user?.role !== 'ADMIN') {
    return reply.code(403).send({ message: 'Solo un administrador puede cancelar reservas' });
  }
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const result = await pool.query(
    `UPDATE reservations
     SET status = 'CANCELLED'
     WHERE id = $1
     RETURNING id, status`,
    [params.id]
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ message: 'Reserva no encontrada' });
  }
  return result.rows[0];
});

app.get('/api/admin/reservations', { preHandler: requireAuth }, async (request, reply) => {
  if (request.user?.role !== 'ADMIN') {
    return reply.code(403).send({ message: 'Requiere rol ADMIN' });
  }
  const result = await pool.query(
    `SELECT r.id, r.start_time, r.end_time, r.status, res.name AS resource_name, u.email AS user_email
     FROM reservations r
     JOIN resources res ON res.id = r.resource_id
     JOIN users u ON u.id = r.user_id
     ORDER BY r.start_time DESC`
  );
  return result.rows;
});

await migrate();
await app.listen({ port: Number(process.env.API_PORT ?? 3000), host: '0.0.0.0' });
