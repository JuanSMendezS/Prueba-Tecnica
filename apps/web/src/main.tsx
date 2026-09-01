import React from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Clock, Lock, LogOut, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import './styles.css';

type Role = 'USER' | 'ADMIN';
type Resource = { id: string; name: string; capacity: number; active: boolean; open_hour: number; close_hour: number };
type Reservation = { id: string; start_time: string; end_time: string; status: string; resource_name?: string; user_email?: string };
type AuthUser = { id: string; email: string; role: Role };
type PendingReservation = { resourceId: string; date: string; hour: number };

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const MESSAGE_TIMEOUT_MS = 10000;

function todayIsoDate() {
  const offset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - offset).toISOString().slice(0, 10);
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
  const [adminResources, setAdminResources] = React.useState<Resource[]>([]);
  const [reservations, setReservations] = React.useState<Reservation[]>([]);
  const [availability, setAvailability] = React.useState<Reservation[]>([]);
  const [adminReservations, setAdminReservations] = React.useState<Reservation[]>([]);
  const [adminView, setAdminView] = React.useState<'reservas' | 'espacios'>('reservas');
  const [resourceId, setResourceId] = React.useState('');
  const [date, setDate] = React.useState(() => todayIsoDate());
  const [selectedHour, setSelectedHour] = React.useState<number | null>(null);
  const [pendingReservation, setPendingReservation] = React.useState<PendingReservation | null>(null);
  const [showAuthModal, setShowAuthModal] = React.useState(false);
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

  async function loadAdminResources() {
    if (user?.role !== 'ADMIN') return;
    setAdminResources(await api<Resource[]>('/api/admin/resources'));
  }

  async function loadReservations() {
    if (!token || user?.role !== 'USER') return;
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
    setSelectedHour(null);
  }, [resourceId, date]);

  React.useEffect(() => {
    if (!resourceId) return;
    const interval = setInterval(() => {
      loadAvailability().catch(() => undefined);
    }, 8000);
    return () => clearInterval(interval);
  }, [resourceId, date]);

  React.useEffect(() => {
    if (selectedHour === null) return;
    const { start, end } = buildSlot(date, selectedHour);
    const nowOccupied = availability.some((entry) => new Date(entry.start_time) < end && new Date(entry.end_time) > start);
    if (nowOccupied) {
      setSelectedHour(null);
      setMessage('Ese horario acaba de ser tomado por otra persona, elige otro.');
    }
  }, [availability]);

  React.useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadAdminResources().catch((error) => setMessage(error.message));
      loadAdminReservations().catch((error) => setMessage(error.message));
    }
  }, [user?.role]);

  React.useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message]);

  async function performReservation(target: PendingReservation) {
    try {
      const { start, end } = buildSlot(target.date, target.hour);
      await api('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ resourceId: target.resourceId, startTime: start.toISOString(), endTime: end.toISOString() })
      });
      setMessage('Reserva confirmada');
      setSelectedHour(null);
      await Promise.all([loadReservations(), loadAvailability()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reservar');
      await loadAvailability();
    }
  }

  React.useEffect(() => {
    if (token && pendingReservation) {
      const target = pendingReservation;
      setPendingReservation(null);
      setShowAuthModal(false);
      performReservation(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    setShowAuthModal(false);
    setMessage('Sesión iniciada');
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setAdminView('reservas');
  }

  function requestReservation() {
    if (!resourceId || selectedHour === null) return;
    const target: PendingReservation = { resourceId, date, hour: selectedHour };
    if (!token) {
      setPendingReservation(target);
      setShowAuthModal(true);
      return;
    }
    performReservation(target);
  }

  async function cancelReservation(id: string) {
    try {
      await api(`/api/reservations/${id}`, { method: 'DELETE' });
      setMessage('Reserva cancelada');
      await Promise.all([loadReservations(), loadAvailability(), loadAdminReservations()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cancelar la reserva');
    }
  }

  async function createResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      await api('/api/admin/resources', {
        method: 'POST',
        body: JSON.stringify({
          name: String(formData.get('name')),
          capacity: Number(formData.get('capacity')),
          openHour: Number(formData.get('openHour') || 6),
          closeHour: Number(formData.get('closeHour') || 18)
        })
      });
      setMessage('Cancha creada');
      form.reset();
      await Promise.all([loadAdminResources(), loadResources()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la cancha');
    }
  }

  async function updateResource(id: string, patch: Partial<{ name: string; capacity: number; active: boolean; openHour: number; closeHour: number }>) {
    try {
      await api(`/api/admin/resources/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await Promise.all([loadAdminResources(), loadResources()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la cancha');
    }
  }

  const selectedResource = resources.find((resource) => resource.id === resourceId);
  const openHour = selectedResource?.open_hour ?? 6;
  const closeHour = selectedResource?.close_hour ?? 18;
  const slotHours = Array.from({ length: Math.max(closeHour - openHour, 0) }, (_, index) => openHour + index);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Reservas de Canchas Deportivas</h1>
        </div>
        <div className="topbar-actions">
          {token && user?.role === 'ADMIN' && (
            <div className="segmented">
              <button type="button" className={adminView === 'reservas' ? 'active' : ''} onClick={() => setAdminView('reservas')}>Reservas</button>
              <button type="button" className={adminView === 'espacios' ? 'active' : ''} onClick={() => setAdminView('espacios')}><ShieldAlert size={14} /> Espacios</button>
            </div>
          )}
          {!token && (
            <button className="primary" type="button" onClick={() => setShowAuthModal(true)}>Iniciar sesión</button>
          )}
          {token && (
            <button className="icon-button" onClick={logout} title="Cerrar sesión">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </section>

      {user?.role === 'ADMIN' ? (
        adminView === 'reservas' ? (
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
                          <button onClick={() => cancelReservation(reservation.id)}>Cancelar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : (
          <section className="panel admin-panel">
            <div className="panel-header">
              <h2><ShieldAlert size={20} /> Gestión de canchas</h2>
              <button className="icon-button" onClick={() => loadAdminResources()} title="Actualizar"><RefreshCw size={18} /></button>
            </div>
            <table className="admin-table">
              <thead>
                <tr><th>Nombre</th><th>Cupo</th><th>Apertura</th><th>Cierre</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {adminResources.map((resource) => (
                  <tr key={resource.id}>
                    <td>{resource.name}</td>
                    <td>
                      <input type="number" min={1} defaultValue={resource.capacity} className="table-input"
                        onBlur={(event) => updateResource(resource.id, { capacity: Number(event.target.value) })} />
                    </td>
                    <td>
                      <input type="number" min={0} max={23} defaultValue={resource.open_hour} className="table-input"
                        onBlur={(event) => updateResource(resource.id, { openHour: Number(event.target.value) })} />
                    </td>
                    <td>
                      <input type="number" min={1} max={24} defaultValue={resource.close_hour} className="table-input"
                        onBlur={(event) => updateResource(resource.id, { closeHour: Number(event.target.value) })} />
                    </td>
                    <td><span className={`status ${resource.active ? 'status-confirmed' : 'status-cancelled'}`}>{resource.active ? 'Activa' : 'Inactiva'}</span></td>
                    <td>
                      <button onClick={() => updateResource(resource.id, { active: !resource.active })}>
                        {resource.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form className="new-resource-form" onSubmit={createResource}>
              <input name="name" placeholder="Nombre de la cancha" minLength={2} required />
              <input name="capacity" type="number" min={1} placeholder="Cupo" required />
              <input name="openHour" type="number" min={0} max={23} defaultValue={6} title="Hora de apertura" />
              <input name="closeHour" type="number" min={1} max={24} defaultValue={18} title="Hora de cierre" />
              <button type="submit" className="primary"><Plus size={18} /> Agregar cancha</button>
            </form>
          </section>
        )
      ) : (
        <section className="workspace-grid">
          <section className="panel list-panel">
            <div className="panel-header">
              <h2>Mis reservas de cancha</h2>
              <button className="icon-button" onClick={loadReservations} title="Actualizar"><RefreshCw size={18} /></button>
            </div>
            {!token && <p className="hint">Inicia sesión para ver tu historial de reservas.</p>}
            {token && reservations.length === 0 && <p className="empty">Aún no hay reservas activas.</p>}
            {token && reservations.map((reservation) => (
              <article className="reservation-item" key={reservation.id}>
                <strong>{reservation.resource_name}</strong>
                <span className="reservation-time">{new Date(reservation.start_time).toLocaleString()} - {new Date(reservation.end_time).toLocaleTimeString()}</span>
                <span className={`status ${reservation.status === 'CONFIRMED' ? 'status-confirmed' : 'status-cancelled'}`}>
                  {reservation.status === 'CONFIRMED' ? 'Confirmada' : 'Cancelada'}
                </span>
              </article>
            ))}
          </section>

          <section className="panel wizard-panel">
            <h2><CalendarDays size={20} /> Nueva reserva de cancha</h2>

            <label>1. Elige una cancha</label>
            <div className="court-tabs">
              {resources.map((resource) => (
                <button
                  type="button"
                  key={resource.id}
                  className={resourceId === resource.id ? 'active' : ''}
                  onClick={() => setResourceId(resource.id)}
                >
                  {resource.name}
                </button>
              ))}
            </div>

            <label>2. Elige un día</label>
            <input type="date" value={date} min={todayIsoDate()} onChange={(event) => setDate(event.target.value)} />
            <p className="hint">Solo se pueden reservar canchas a partir de hoy; no se permiten fechas pasadas.</p>

            {resourceId && (
              <>
                <label>3. Elige una hora ({String(openHour).padStart(2, '0')}:00 - {String(closeHour).padStart(2, '0')}:00)</label>
                <div className="slot-legend">
                  <span className="legend-item"><i className="legend-swatch legend-free" /> Disponible</span>
                  <span className="legend-item"><i className="legend-swatch legend-occupied" /> Ocupada</span>
                  <span className="legend-item"><i className="legend-swatch legend-selected" /> Seleccionada</span>
                </div>
                <div className="slot-grid">
                  {slotHours.map((hour) => {
                    const { start, end } = buildSlot(date, hour);
                    const occupied = availability.some((entry) => new Date(entry.start_time) < end && new Date(entry.end_time) > start);
                    const selected = selectedHour === hour;
                    return (
                      <button
                        type="button"
                        key={hour}
                        className={`slot ${selected ? 'slot-selected' : occupied ? 'slot-occupied' : 'slot-free'}`}
                        onClick={() => !occupied && setSelectedHour(hour)}
                        disabled={occupied}
                        title={occupied ? 'Horario ocupado' : 'Horario disponible'}
                      >
                        {occupied && <Lock size={13} />}
                        {String(hour).padStart(2, '0')}:00
                      </button>
                    );
                  })}
                </div>
                <p className="hint">Selecciona un bloque libre para continuar. La disponibilidad se actualiza automáticamente.</p>
              </>
            )}

            {selectedHour !== null && selectedResource && (
              <div className="confirm-box">
                <p><strong>{selectedResource.name}</strong> · {date} · {String(selectedHour).padStart(2, '0')}:00 - {String(selectedHour + 1).padStart(2, '0')}:00</p>
                <button className="primary" onClick={requestReservation}><Clock size={18} /> Confirmar reserva</button>
              </div>
            )}
          </section>
        </section>
      )}

      {showAuthModal && (
        <div className="modal-backdrop" onClick={() => { setShowAuthModal(false); setPendingReservation(null); }}>
          <form className="panel auth-panel modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={submitAuth}>
            <div className="segmented">
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Registro</button>
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
            </div>
            {pendingReservation && <p className="hint">Inicia sesión para confirmar tu reserva.</p>}
            {authMode === 'register' && <input name="name" placeholder="Nombre" minLength={2} required />}
            <input name="email" placeholder="Email" type="email" required />
            <input name="password" placeholder="Contraseña" type="password" minLength={6} required />
            <button type="submit" className="primary"><Plus size={18} /> Entrar</button>
          </form>
        </div>
      )}

      {message && <div className="toast">{message}</div>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);


