import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

export type Role = 'USER' | 'ADMIN';

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

const jwtSecret = process.env.JWT_SECRET ?? 'dev-secret';

export function signToken(user: AuthUser) {
  return jwt.sign(user, jwtSecret, { expiresIn: '8h' });
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    return reply.code(401).send({ message: 'Token requerido' });
  }

  try {
    request.user = jwt.verify(token, jwtSecret) as AuthUser;
  } catch {
    return reply.code(401).send({ message: 'Token inválido o expirado' });
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
