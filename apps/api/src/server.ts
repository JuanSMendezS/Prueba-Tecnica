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
  const result = await pool.query('SELECT id, name, capacity, active FROM resources WHERE active = true ORDER BY name');
  return result.rows;
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
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const isAdmin = request.user?.role === 'ADMIN';
  const result = await pool.query(
    `UPDATE reservations
     SET status = 'CANCELLED'
     WHERE id = $1 AND ($2::boolean OR user_id = $3)
     RETURNING id, status`,
    [params.id, isAdmin, request.user?.id]
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
