import bcrypt from 'bcryptjs';
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://reservas:reservas@localhost:5432/reservas'
});

export async function migrate() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role text NOT NULL CHECK (role IN ('USER', 'ADMIN')) DEFAULT 'USER',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS resources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      capacity integer NOT NULL CHECK (capacity > 0),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_id uuid NOT NULL REFERENCES resources(id),
      user_id uuid NOT NULL REFERENCES users(id),
      start_time timestamptz NOT NULL,
      end_time timestamptz NOT NULL,
      status text NOT NULL CHECK (status IN ('CONFIRMED', 'CANCELLED')) DEFAULT 'CONFIRMED',
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (start_time < end_time),
      EXCLUDE USING gist (
        resource_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
      ) WHERE (status = 'CONFIRMED')
    );

    CREATE INDEX IF NOT EXISTS idx_reservations_resource_range
      ON reservations (resource_id, start_time, end_time);

    INSERT INTO resources (name, capacity)
    VALUES ('Cancha de Fútbol 5', 10), ('Cancha de Básquet', 10), ('Cancha de Tenis', 4)
    ON CONFLICT DO NOTHING;
  `);

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@demo.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Administrador', $1, $2, 'ADMIN')
     ON CONFLICT (email) DO NOTHING`,
    [adminEmail, passwordHash]
  );
}
