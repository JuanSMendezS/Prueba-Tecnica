import React from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Clock, LogOut, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import './styles.css';

type Resource = { id: string; name: string; capacity: number; active: boolean };
type Reservation = { id: string; start_time: string; end_time: string; status: string; resource_name?: string };

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function App() {
  const [token, setToken] = React.useState(() => localStorage.getItem('token') ?? '');
  const [resources, setResources] = React.useState<Resource[]>([]);
  const [reservations, setReservations] = React.useState<Reservation[]>([]);
  const [resourceId, setResourceId] = React.useState('');
  const [startTime, setStartTime] = React.useState(() => toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [endTime, setEndTime] = React.useState(() => toLocalInputValue(new Date(Date.now() + 25 * 60 * 60 * 1000)));
  const [message, setMessage] = React.useState('');
  const [authMode, setAuthMode] = React.useState<'login' | 'register'>('register');

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.message ?? 'Error inesperado');
    }
    return body;
  }

  async function loadResources() {
    const data = await api<Resource[]>('/api/resources');
    setResources(data);
    setResourceId((current) => current || data[0]?.id || '');
  }

  async function loadReservations() {
    if (!token) return;
    setReservations(await api<Reservation[]>('/api/reservations/me'));
  }

  React.useEffect(() => {
    loadResources().catch((error) => setMessage(error.message));
  }, []);

  React.useEffect(() => {
    loadReservations().catch(() => undefined);
  }, [token]);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') || 'Usuario Demo'),
      email: String(form.get('email')),
      password: String(form.get('password'))
    };
    const result = await api<{ token: string }>(`/api/auth/${authMode}`, { method: 'POST', body: JSON.stringify(payload) });
    localStorage.setItem('token', result.token);
    setToken(result.token);
    setMessage('Sesión iniciada');
  }

  async function createReservation(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          resourceId,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString()
        })
      });
      setMessage('Reserva confirmada');
      await loadReservations();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reservar');
    }
  }

  async function cancelReservation(id: string) {
    await api(`/api/reservations/${id}`, { method: 'DELETE' });
    setMessage('Reserva cancelada');
    await loadReservations();
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow"><ShieldCheck size={16} /> Zero double-booking</p>
          <h1>Reservas seguras por concurrencia</h1>
        </div>
        {token && (
          <button className="icon-button" onClick={() => { localStorage.removeItem('token'); setToken(''); }} title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        )}
      </section>

      <section className="workspace-grid">
        {!token && (
          <form className="panel auth-panel" onSubmit={submitAuth}>
            <div className="segmented">
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Registro</button>
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
            </div>
            {authMode === 'register' && <input name="name" placeholder="Nombre" minLength={2} required />}
            <input name="email" placeholder="Email" type="email" required />
            <input name="password" placeholder="Contraseña" type="password" minLength={6} required />
            <button type="submit" className="primary"><Plus size={18} /> Entrar</button>
          </form>
        )}

        <form className="panel reservation-panel" onSubmit={createReservation}>
          <h2><CalendarDays size={20} /> Nueva reserva</h2>
          <label>Recurso</label>
          <select value={resourceId} onChange={(event) => setResourceId(event.target.value)} required>
            {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resource.capacity} personas</option>)}
          </select>
          <label>Inicio</label>
          <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
          <label>Fin</label>
          <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
          <button type="submit" className="primary" disabled={!token || !resourceId}><Clock size={18} /> Reservar</button>
          {!token && <p className="hint">Inicia sesión para confirmar horarios.</p>}
        </form>

        <section className="panel list-panel">
          <div className="panel-header">
            <h2>Mis reservas</h2>
            <button className="icon-button" onClick={loadReservations} title="Actualizar"><RefreshCw size={18} /></button>
          </div>
          {reservations.length === 0 ? <p className="empty">Aún no hay reservas activas.</p> : reservations.map((reservation) => (
            <article className="reservation-item" key={reservation.id}>
              <strong>{reservation.resource_name}</strong>
              <span>{new Date(reservation.start_time).toLocaleString()} - {new Date(reservation.end_time).toLocaleTimeString()}</span>
              <button onClick={() => cancelReservation(reservation.id)}>Cancelar</button>
            </article>
          ))}
        </section>
      </section>

      {message && <div className="toast">{message}</div>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
