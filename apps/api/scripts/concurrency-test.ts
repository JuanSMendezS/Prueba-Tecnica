const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
const totalRequests = Number(process.env.CONCURRENCY_REQUESTS ?? 25);

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers }
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

const runId = Date.now();
const email = `race-${runId}@example.com`;
const password = 'secret123';

const registered = await request('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({ name: 'Race Tester', email, password })
});

if (registered.response.status !== 201) {
  throw new Error(`No se pudo registrar usuario de prueba: ${registered.response.status}`);
}

const resources = await request('/api/resources');
const resource = resources.body?.[0];
if (!resource) {
  throw new Error('No hay recursos disponibles para la prueba');
}

const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
start.setUTCHours(10, 0, 0, 0);
const end = new Date(start.getTime() + 60 * 60 * 1000);

const attempts = await Promise.all(
  Array.from({ length: totalRequests }, () =>
    request('/api/reservations', {
      method: 'POST',
      headers: { authorization: `Bearer ${registered.body.token}` },
      body: JSON.stringify({ resourceId: resource.id, startTime: start.toISOString(), endTime: end.toISOString() })
    })
  )
);

const created = attempts.filter(({ response }) => response.status === 201).length;
const conflicts = attempts.filter(({ response }) => response.status === 409).length;
const winner = attempts.find(({ response }) => response.status === 201)?.body;

console.log({ totalRequests, created, conflicts, resource: resource.name, start: start.toISOString(), end: end.toISOString() });

// Libera el slot para que el script se pueda volver a ejecutar sin colisionar con la reserva ganadora.
if (winner) {
  await request(`/api/reservations/${winner.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${registered.body.token}` }
  });
}

if (created !== 1 || conflicts !== totalRequests - 1) {
  throw new Error(`Concurrencia inválida: se esperaban 1 creado y ${totalRequests - 1} conflictos`);
}
