import React from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Clock, LogOut, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import './styles.css';

type Role = 'USER' | 'ADMIN';
type Resource = { id: string; name: string; capacity: number; active: boolean };
type Reservation = { id: string; start_time: string; end_time: string; status: string; resource_name?: string; user_email?: string };
type AuthUser = { id: string; email: string; role: Role };

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const SLOT_START_HOUR = 8;
const SLOT_END_HOUR = 20;

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function todayIsoDate() {
  return toLocalInputValue(new Date()).slice(0, 10);
}

function buildSlot(dateIso: string, hour: number) {
  const start = new Date(`${dateIso}T${String(hour).padStart(2, '0')}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

function App() {
  const [token, setToken] = React.useState(() => localStorage.getItem('token') ?? '');
  const [user, setUser] = React.useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [resources, setResources] = React.useState<Resource[]>([]);
  const [reservations, setReservations] = React.useState<Reservation[]>([]);
  const [availability, setAvailability] = React.useState<Reservation[]>([]);
  const [adminReservations, setAdminReservations] = React.useState<Reservation[]>([]);
  const [view, setView] = React.useState<'reservas' | 'admin'>('reservas');
  const [resourceId, setResourceId] = React.useState('');
  const [date, setDate] = React.useState(() => todayIsoDate());
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

  async function loadAvailability() {
    if (!resourceId) return;
    setAvailability(await api<Reservation[]>(`/api/reservations/availability?resourceId=${resourceId}&date=${date}`));
  }

  async function loadAdminReservations() {
    if (user?.role !== 'ADMIN') return;
    setAdminReservations(await api<Reservation[]>('/api/admin/reservations'));
  }

  React.useEffect(() => {
    loadResources().catch((error) => setMessage(error.message));
  }, []);

  React.useEffect(() => {
    loadReservations().catch(() => undefined);
  }, [token]);

  React.useEffect(() => {
    loadAvailability().catch((error) => setMessage(error.message));
  }, [resourceId, date]);

  React.useEffect(() => {
    if (view === 'admin') {
      loadAdminReservations().catch((error) => setMessage(error.message));
    }
  }, [view]);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') || 'Usuario Demo'),
      email: String(form.get('email')),
      password: String(form.get('password'))
    };
    const result = await api<{ token: string; user: AuthUser }>(`/api/auth/${authMode}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
    setMessage('Sesión iniciada');
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setView('reservas');
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
      await Promise.all([loadReservations(), loadAvailability()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reservar');
      await loadAvailability();
    }
  }

  function selectSlot(hour: number, occupied: boolean) {
    if (occupied || !token) return;
    const { start, end } = buildSlot(date, hour);
    setStartTime(toLocalInputValue(start));
    setEndTime(toLocalInputValue(end));
  }

  async function cancelReservation(id: string, fromAdmin = false) {
    await api(`/api/reservations/${id}`, { method: 'DELETE' });
    setMessage('Reserva cancelada');
    await Promise.all([loadReservations(), loadAvailability(), fromAdmin ? loadAdminReservations() : Promise.resolve()]);
  }

  const slotHours = Array.from({ length: SLOT_END_HOUR - SLOT_START_HOUR }, (_, index) => SLOT_START_HOUR + index);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Reservas de Canchas Deportivas</h1>
        </div>
        {token && (
          <div className="topbar-actions">
            {user?.role === 'ADMIN' && (
              <div className="segmented">
                <button type="button" className={view === 'reservas' ? 'active' : ''} onClick={() => setView('reservas')}>Mis reservas</button>
                <button type="button" className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}><ShieldAlert size={14} /> Panel Admin</button>
              </div>
            )}
            <button className="icon-button" onClick={logout} title="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        )}
      </section>

      {view === 'admin' && user?.role === 'ADMIN' ? (
        <section className="panel admin-panel">
          <div className="panel-header">
            <h2><ShieldAlert size={20} /> Todas las reservas de canchas</h2>
            <button className="icon-button" onClick={() => loadAdminReservations()} title="Actualizar"><RefreshCw size={18} /></button>
          </div>
          {adminReservations.length === 0 ? <p className="empty">No hay reservas registradas.</p> : (
            <table className="admin-table">
              <thead>
                <tr><th>Cancha</th><th>Usuario</th><th>Inicio</th><th>Fin</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {adminReservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td>{reservation.resource_name}</td>
                    <td>{reservation.user_email}</td>
                    <td>{new Date(reservation.start_time).toLocaleString()}</td>
                    <td>{new Date(reservation.end_time).toLocaleTimeString()}</td>
                    <td><span className={`status status-${reservation.status.toLowerCase()}`}>{reservation.status}</span></td>
                    <td>
                      {reservation.status === 'CONFIRMED' && (
                        <button onClick={() => cancelReservation(reservation.id, true)}>Cancelar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
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

          <div className="panel-stack">
            <form className="panel reservation-panel" onSubmit={createReservation}>
              <h2><CalendarDays size={20} /> Nueva reserva de cancha</h2>
              <label>Cancha</label>
              <select value={resourceId} onChange={(event) => setResourceId(event.target.value)} required>
                {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · cupo {resource.capacity}</option>)}
              </select>
              <label>Fecha</label>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              <label>Inicio</label>
              <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
              <label>Fin</label>
              <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
              <button type="submit" className="primary" disabled={!token || !resourceId}><Clock size={18} /> Reservar</button>
              {!token && <p className="hint">Inicia sesión para confirmar horarios.</p>}
            </form>

            <section className="panel availability-panel">
              <h2><Clock size={20} /> Disponibilidad de la cancha</h2>
              <div className="slot-grid">
                {slotHours.map((hour) => {
                  const { start, end } = buildSlot(date, hour);
                  const occupied = availability.some((entry) => new Date(entry.start_time) < end && new Date(entry.end_time) > start);
                  return (
                    <button
                      type="button"
                      key={hour}
                      className={`slot ${occupied ? 'slot-occupied' : 'slot-free'}`}
                      onClick={() => selectSlot(hour, occupied)}
                      disabled={occupied || !token}
                    >
                      {String(hour).padStart(2, '0')}:00
                    </button>
                  );
                })}
              </div>
              <p className="hint">Verde: disponible · Rojo: ocupado. Clic en un bloque libre para prellenar el formulario.</p>
            </section>
          </div>

          <section className="panel list-panel">
            <div className="panel-header">
              <h2>Mis reservas de cancha</h2>
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
      )}

      {message && <div className="toast">{message}</div>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

