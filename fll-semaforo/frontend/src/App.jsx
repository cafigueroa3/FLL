import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";

const socket = io();

const LIGHTS = {
  verde: { label: "Listo para iniciar" },
  amarillo: { label: "Necesito ayuda" },
  rojo: { label: "No listo" },
};

const DEFAULT_NUM_MESAS = 8;
const SUPER_AUTH_KEY = "fll-super-password";
const headAuthKey = (torneoId) => `fll-head-password:${torneoId}`;
const lastMesaKey = (torneoId) => `fll-last-mesa:${torneoId}`;

/* ------------------------------------------------------------------ *
 * Ruteo mínimo con el historial del navegador.
 *
 * Cada pantalla tiene su propia URL, así que el botón "atrás" de Android
 * (y el del navegador) navega dentro de la app en vez de cerrarla.
 * ------------------------------------------------------------------ */

function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, "", to);
  else window.history.pushState({}, "", to);
  // popstate no se dispara solo al hacer pushState: lo emitimos nosotros para
  // que la app se entere del cambio de ruta.
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

function parseRoute(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "inicio" };
  if (parts[0] === "admin") return { name: "admin" };
  if (parts[0] === "t" && parts[1]) {
    const torneoId = decodeURIComponent(parts[1]);
    if (!parts[2]) return { name: "torneo", torneoId };
    if (parts[2] === "mesa") {
      if (parts[3]) return { name: "mesa", torneoId, mesa: Number(parts[3]) };
      return { name: "elegirMesa", torneoId };
    }
    if (parts[2] === "general") return { name: "general", torneoId };
  }
  return { name: "noEncontrado" };
}

const urlTorneo = (id) => `/t/${encodeURIComponent(id)}`;

/* ------------------------------------------------------------------ *
 * Iconos y utilidades visuales
 * ------------------------------------------------------------------ */

function Icon({ kind, className }) {
  if (kind === "verde") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M5 13l4 4L19 7"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "amarillo") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 4v9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="18" r="1.3" fill="white" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowLeftIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M19 12H5M11 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15 1.65 1.65 0 003.17 14H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9 1.65 1.65 0 004.27 7.18l-.06-.06A2 2 0 117.04 4.29l.06.06A1.65 1.65 0 008.92 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.36.4.66.74.84.24.13.51.2.79.2H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark">
      <img src="/logo.png" alt="Logo FIRST LEGO League" className="brand-logo" />

      <div className="brand-mark-text">
        Juego de robot
        <br />
        <span>Arbitraje FLL</span>
      </div>
    </div>
  );
}

function Creditos() {
  return (
    <div className="creditos">
      Creado por: Catalina Figueroa y Diego Riquelme — Chile
    </div>
  );
}

function mesaLabel(n) {
  // 1 -> A, 2 -> B, ... 27 -> AA (por si acaso se configuran muchas mesas)
  let label = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    num = Math.floor((num - 1) / 26);
  }
  return label;
}

function timeAgo(ts) {
  if (!ts) return "sin datos";
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 3) return "recién";
  if (secs < 60) return `hace ${secs}s`;
  const mins = Math.floor(secs / 60);
  return `hace ${mins}m ${secs % 60}s`;
}

/* ------------------------------------------------------------------ *
 * Conexión con el servidor
 * ------------------------------------------------------------------ */

function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    // Si el socket se conectó justo entre el primer render y este efecto, el
    // evento "connect" no nos alcanza: sincronizamos el valor actual.
    setConnected(socket.connected);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);
  return connected;
}

function useTorneosList() {
  const [torneos, setTorneos] = useState(null);
  useEffect(() => {
    const onTorneos = (lista) => setTorneos(lista);
    const pedir = () => socket.emit("listTorneos", onTorneos);
    socket.on("torneos", onTorneos);
    socket.on("connect", pedir);
    if (socket.connected) pedir();
    return () => {
      socket.off("torneos", onTorneos);
      socket.off("connect", pedir);
    };
  }, []);
  return torneos;
}

// Estado de UN torneo: se suscribe solo a los cambios de ese torneo.
function useTorneo(torneoId) {
  const [torneo, setTorneo] = useState(null);
  const [noExiste, setNoExiste] = useState(false);
  const [headAuthed, setHeadAuthed] = useState(false);

  useEffect(() => {
    if (!torneoId) return undefined;
    let cancelado = false;
    setTorneo(null);
    setNoExiste(false);
    setHeadAuthed(false);

    const entrar = () => {
      socket.emit("joinTorneo", torneoId, (res) => {
        if (cancelado) return;
        if (!res || !res.ok) {
          setNoExiste(true);
          return;
        }
        setNoExiste(false);
        setTorneo(res.torneo);
        // Si esta persona ya se había autenticado como árbitro general de
        // este torneo en este teléfono, la reconectamos sola.
        const guardada = localStorage.getItem(headAuthKey(torneoId));
        if (!guardada) return;
        socket.emit("authHead", { torneoId, password: guardada }, (ok) => {
          if (cancelado) return;
          setHeadAuthed(ok);
          if (!ok) localStorage.removeItem(headAuthKey(torneoId));
        });
      });
    };

    const onState = (s) => {
      if (s && s.id === torneoId) setTorneo(s);
    };
    const onEliminado = (id) => {
      if (id === torneoId) navigate("/", { replace: true });
    };

    socket.on("state", onState);
    socket.on("torneoEliminado", onEliminado);
    socket.on("connect", entrar);
    if (socket.connected) entrar();

    return () => {
      cancelado = true;
      socket.off("state", onState);
      socket.off("torneoEliminado", onEliminado);
      socket.off("connect", entrar);
    };
  }, [torneoId]);

  const loginHead = useCallback(
    (password) =>
      new Promise((resolve) => {
        socket.emit("authHead", { torneoId, password }, (ok) => {
          if (ok) {
            localStorage.setItem(headAuthKey(torneoId), password);
            setHeadAuthed(true);
          }
          resolve(ok);
        });
      }),
    [torneoId]
  );

  const logoutHead = useCallback(() => {
    localStorage.removeItem(headAuthKey(torneoId));
    setHeadAuthed(false);
  }, [torneoId]);

  return { torneo, noExiste, headAuthed, loginHead, logoutHead };
}

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

export default function App() {
  const path = usePath();
  const route = parseRoute(path);
  const connected = useConnected();

  return (
    <div className="app">
      {!connected && (
        <div className="offline-banner">
          Sin conexión al servidor — revisa tu conexión a internet
        </div>
      )}
      {route.name === "inicio" && <Inicio />}
      {route.name === "admin" && <AdminView />}
      {route.name === "noEncontrado" && <NoEncontrado />}
      {["torneo", "elegirMesa", "mesa", "general"].includes(route.name) && (
        <VistaTorneo route={route} />
      )}
    </div>
  );
}

function TopBar({ title, subtitle, onBack, right }) {
  return (
    <div className="topbar-row">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Volver">
          <ArrowLeftIcon className="" />
        </button>
        <div>
          <h2 className="topbar-title">{title}</h2>
          {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ---------------------------- Inicio ------------------------------ */

function Inicio() {
  const torneos = useTorneosList();

  return (
    <div className="page center">
      <div className="home-header">
        <BrandMark />
        <h1 className="home-title">Semáforo de Mesas</h1>
        <p className="home-subtitle">
          Juego de Robot: elige el torneo en el que estás arbitrando.
        </p>
      </div>

      {torneos === null && <p className="mesa-hint">Cargando torneos…</p>}

      {torneos !== null && torneos.length === 0 && (
        <p className="mesa-hint">
          Todavía no hay torneos creados. Entra a la administración para crear el
          primero.
        </p>
      )}

      {torneos !== null && torneos.length > 0 && (
        <div className="torneo-list">
          {torneos.map((t) => (
            <button
              key={t.id}
              className="torneo-card"
              onClick={() => navigate(urlTorneo(t.id))}
            >
              <div className="torneo-card-main">
                <div className="torneo-card-nombre">{t.nombre}</div>
                <div className="torneo-card-meta">
                  {t.numMesas} {t.numMesas === 1 ? "mesa" : "mesas"}
                </div>
              </div>
              <div className="torneo-card-pills">
                {t.resumen.amarillo > 0 && (
                  <span className="pill amarillo">{t.resumen.amarillo}</span>
                )}
                <span className="pill verde">{t.resumen.verde}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <button className="link-btn" onClick={() => navigate("/admin")}>
        Administrar torneos
      </button>

      <Creditos />
    </div>
  );
}

function NoEncontrado() {
  return (
    <div className="page center">
      <BrandMark />
      <h1 className="home-title">Página no encontrada</h1>
      <button className="btn-primary" onClick={() => navigate("/")}>
        Ir al inicio
      </button>
    </div>
  );
}

/* ------------------------- Vistas de torneo ------------------------ */

function VistaTorneo({ route }) {
  const { torneoId } = route;
  const { torneo, noExiste, headAuthed, loginHead, logoutHead } =
    useTorneo(torneoId);

  if (noExiste) {
    return (
      <div className="page center">
        <BrandMark />
        <h1 className="home-title">Torneo no encontrado</h1>
        <p className="mesa-hint">
          El link puede estar mal escrito o el torneo ya fue eliminado.
        </p>
        <button className="btn-primary" onClick={() => navigate("/")}>
          Ver torneos disponibles
        </button>
      </div>
    );
  }

  if (!torneo) {
    return (
      <div className="page center">
        <p className="mesa-hint">Cargando…</p>
      </div>
    );
  }

  if (route.name === "torneo") return <TorneoHome torneo={torneo} />;
  if (route.name === "elegirMesa") return <ElegirMesa torneo={torneo} />;
  if (route.name === "mesa") return <MesaView torneo={torneo} mesa={route.mesa} />;
  if (route.name === "general") {
    return headAuthed ? (
      <HeadView torneo={torneo} onLogout={logoutHead} />
    ) : (
      <HeadGate torneo={torneo} onSubmit={loginHead} />
    );
  }
  return null;
}

function TorneoHome({ torneo }) {
  const irAMesa = () => {
    const guardada = localStorage.getItem(lastMesaKey(torneo.id));
    const n = Number(guardada);
    if (n && n >= 1 && n <= torneo.numMesas) {
      navigate(`${urlTorneo(torneo.id)}/mesa/${n}`);
    } else {
      navigate(`${urlTorneo(torneo.id)}/mesa`);
    }
  };

  return (
    <div className="page center">
      <div className="home-header">
        <BrandMark />
        <h1 className="home-title">{torneo.nombre}</h1>
        <p className="home-subtitle">
          Indica el estado de tu mesa o supervisa todas las mesas desde una sola
          pantalla.
        </p>
      </div>

      <div className="home-grid">
        <button className="role-card role-referee" onClick={irAMesa}>
          <div className="role-badge">M</div>
          <div>
            <div className="role-title">Soy árbitro de mesa</div>
            <div className="role-desc">Selecciona tu mesa y enciende tu luz</div>
          </div>
        </button>

        <button
          className="role-card role-head"
          onClick={() => navigate(`${urlTorneo(torneo.id)}/general`)}
        >
          <div className="role-badge">G</div>
          <div>
            <div className="role-title">Soy árbitro general</div>
            <div className="role-desc">Ve el estado de todas las mesas</div>
          </div>
        </button>
      </div>

      <button className="link-btn" onClick={() => navigate("/")}>
        Cambiar de torneo
      </button>

      <Creditos />
    </div>
  );
}

function ElegirMesa({ torneo }) {
  const guardada = Number(localStorage.getItem(lastMesaKey(torneo.id))) || null;

  const elegir = (n) => {
    localStorage.setItem(lastMesaKey(torneo.id), String(n));
    navigate(`${urlTorneo(torneo.id)}/mesa/${n}`);
  };

  return (
    <div className="page">
      <TopBar
        title="Selecciona tu mesa"
        subtitle={torneo.nombre}
        onBack={() => navigate(urlTorneo(torneo.id))}
      />
      <div className="page center" style={{ padding: 0 }}>
        <p className="mesa-hint">Toca la letra de tu mesa</p>
        <div className="mesa-grid">
          {Array.from({ length: torneo.numMesas }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              className={`mesa-btn ${guardada === n ? "mesa-btn-actual" : ""}`}
              onClick={() => elegir(n)}
            >
              {mesaLabel(n)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MesaView({ torneo, mesa }) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mesa || mesa < 1 || mesa > torneo.numMesas) {
      navigate(`${urlTorneo(torneo.id)}/mesa`, { replace: true });
      return;
    }
    localStorage.setItem(lastMesaKey(torneo.id), String(mesa));
  }, [mesa, torneo.id, torneo.numMesas]);

  if (!mesa || mesa < 1 || mesa > torneo.numMesas) return null;

  const setLight = (light) => {
    setSaving(true);
    socket.emit("setLight", { torneoId: torneo.id, mesa, light });
    setTimeout(() => setSaving(false), 300);
  };

  const status = torneo.tables[mesa];
  const current = status?.light || "rojo";
  const conf = LIGHTS[current];

  return (
    <div className="page">
      <TopBar
        title={`Mesa ${mesaLabel(mesa)}`}
        subtitle={torneo.nombre}
        onBack={() => navigate(`${urlTorneo(torneo.id)}/mesa`)}
      />
      <div className="page center" style={{ padding: 0, gap: 32 }}>
        <button
          className="change-mesa"
          onClick={() => navigate(`${urlTorneo(torneo.id)}/mesa`)}
        >
          Cambiar de mesa
        </button>

        <div className={`big-light bg-${current} ring-${current}`}>
          <Icon kind={current} />
        </div>
        <div className="status-text">
          <div className={`status-label text-${current}`}>{conf.label}</div>
          <div className="status-time">
            {saving ? "Guardando…" : `Actualizado ${timeAgo(status?.updatedAt)}`}
          </div>
        </div>

        <div className="light-buttons">
          {["verde", "amarillo", "rojo"].map((key) => {
            const active = current === key;
            return (
              <button
                key={key}
                className={`light-btn ${active ? "active" : "inactive"} ${key}`}
                onClick={() => setLight(key)}
              >
                <Icon kind={key} />
                <span>{LIGHTS[key].label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeadGate({ torneo, onSubmit }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    setError("");
    const ok = await onSubmit(password);
    setChecking(false);
    if (!ok) {
      setError("Contraseña incorrecta");
      setPassword("");
    }
  };

  return (
    <div className="page">
      <TopBar
        title="Árbitro general"
        subtitle={torneo.nombre}
        onBack={() => navigate(urlTorneo(torneo.id))}
      />
      <div className="page center" style={{ padding: 0 }}>
        <form className="auth-form" onSubmit={submit}>
          <p className="mesa-hint">
            Contraseña de árbitro general de <b>{torneo.nombre}</b>
          </p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
          />
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-primary" type="submit" disabled={checking}>
            {checking ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function HeadView({ torneo, onLogout }) {
  const [showSettings, setShowSettings] = useState(false);
  const [draftNum, setDraftNum] = useState(torneo.numMesas);

  useEffect(() => {
    setDraftNum(torneo.numMesas);
  }, [torneo.numMesas]);

  const saveNumMesas = () => {
    socket.emit("setNumMesas", { torneoId: torneo.id, numMesas: draftNum });
    setShowSettings(false);
  };

  const rows = Array.from({ length: torneo.numMesas }, (_, i) => i + 1).map((n) => ({
    mesa: n,
    light: torneo.tables[n]?.light || "rojo",
    updatedAt: torneo.tables[n]?.updatedAt || null,
    registered: Boolean(torneo.tables[n]),
  }));

  // Las mesas se muestran SIEMPRE en el mismo orden (A, B, C…) para que el
  // panel sea estable de mirar: lo que cambia es el color, no la posición.
  const needHelp = rows.filter((r) => r.light === "amarillo").length;
  const ready = rows.filter((r) => r.light === "verde").length;

  return (
    <div className="page">
      <TopBar
        title="Panel del árbitro general"
        subtitle={torneo.nombre}
        onBack={() => navigate(urlTorneo(torneo.id))}
        right={
          <button className="icon-btn" onClick={() => setShowSettings((s) => !s)}>
            <SettingsIcon className="" />
          </button>
        }
      />

      {showSettings && (
        <div className="settings-panel">
          <label>Cantidad de mesas (A - {mesaLabel(Number(draftNum) || 1)}):</label>
          <input
            type="number"
            min={1}
            max={30}
            value={draftNum}
            onChange={(e) => setDraftNum(e.target.value)}
          />
          <button className="btn-primary" onClick={saveNumMesas}>
            Guardar
          </button>
          <button className="change-mesa" type="button" onClick={onLogout}>
            Cerrar sesión
          </button>
          <button
            className="btn-danger-outline"
            onClick={() => {
              if (confirm("¿Poner todas las mesas en rojo?")) {
                socket.emit("resetAll", { torneoId: torneo.id });
              }
            }}
          >
            Reiniciar todas a rojo
          </button>
        </div>
      )}

      <div className="summary-row">
        <span className="pill amarillo">{needHelp} necesitan ayuda</span>
        <span className="pill verde">{ready} listas</span>
      </div>

      <div className="tables-grid">
        {rows.map((r) => (
          <div key={r.mesa} className={`table-card ${r.light}`}>
            <div className="table-card-label">Mesa</div>
            <div className="table-card-num">{mesaLabel(r.mesa)}</div>
            <div className={`table-card-icon bg-${r.light}`}>
              <Icon kind={r.light} />
            </div>
            <div className={`table-card-status text-${r.light}`}>
              {LIGHTS[r.light].label}
            </div>
            <div className="table-card-time">
              {r.registered ? timeAgo(r.updatedAt) : "sin registrar"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------- Administración (superadmin) ----------------- */

function useSuperAdmin() {
  const [authed, setAuthed] = useState(false);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const intentar = () => {
      const guardada = localStorage.getItem(SUPER_AUTH_KEY);
      if (!guardada) {
        if (!cancelado) setVerificando(false);
        return;
      }
      socket.emit("authSuper", guardada, (ok) => {
        if (cancelado) return;
        setAuthed(ok);
        setVerificando(false);
        if (!ok) localStorage.removeItem(SUPER_AUTH_KEY);
      });
    };
    socket.on("connect", intentar);
    if (socket.connected) intentar();
    else setVerificando(true);
    return () => {
      cancelado = true;
      socket.off("connect", intentar);
    };
  }, []);

  const login = (password) =>
    new Promise((resolve) => {
      socket.emit("authSuper", password, (ok) => {
        if (ok) {
          localStorage.setItem(SUPER_AUTH_KEY, password);
          setAuthed(true);
        }
        resolve(ok);
      });
    });

  const logout = () => {
    localStorage.removeItem(SUPER_AUTH_KEY);
    socket.emit("authSuper", "");
    setAuthed(false);
  };

  return { authed, verificando, login, logout };
}

function AdminView() {
  const { authed, verificando, login, logout } = useSuperAdmin();
  const torneos = useTorneosList();

  if (!authed) {
    return (
      <AdminGate onSubmit={login} verificando={verificando} />
    );
  }

  return (
    <div className="page">
      <TopBar
        title="Administración"
        subtitle="Todos los torneos"
        onBack={() => navigate("/")}
      />
      <NuevoTorneo />
      <div className="admin-list">
        {(torneos || []).map((t) => (
          <TorneoAdminCard key={t.id} torneo={t} />
        ))}
      </div>
      <button className="link-btn" onClick={logout}>
        Cerrar sesión de administrador
      </button>
    </div>
  );
}

function AdminGate({ onSubmit, verificando }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    setError("");
    const ok = await onSubmit(password);
    setChecking(false);
    if (!ok) {
      setError("Contraseña incorrecta");
      setPassword("");
    }
  };

  return (
    <div className="page">
      <TopBar title="Administración" onBack={() => navigate("/")} />
      <div className="page center" style={{ padding: 0 }}>
        <form className="auth-form" onSubmit={submit}>
          <p className="mesa-hint">
            {verificando ? "Verificando…" : "Contraseña de administrador general"}
          </p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
          />
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-primary" type="submit" disabled={checking}>
            {checking ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function NuevoTorneo() {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [numMesas, setNumMesas] = useState(DEFAULT_NUM_MESAS);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const crear = (e) => {
    e.preventDefault();
    setError("");
    socket.emit(
      "crearTorneo",
      { nombre, numMesas: Number(numMesas), password },
      (res) => {
        if (res && res.ok) {
          setNombre("");
          setPassword("");
          setNumMesas(DEFAULT_NUM_MESAS);
          setAbierto(false);
        } else if (res && res.error === "password-corta") {
          setError("La contraseña debe tener al menos 4 caracteres");
        } else if (res && res.error === "nombre-vacio") {
          setError("Ponle un nombre al torneo");
        } else {
          setError("No se pudo crear el torneo");
        }
      }
    );
  };

  if (!abierto) {
    return (
      <button className="btn-primary btn-block" onClick={() => setAbierto(true)}>
        + Nuevo torneo
      </button>
    );
  }

  return (
    <form className="admin-form" onSubmit={crear}>
      <label>
        Nombre del torneo
        <input
          type="text"
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Torneo Regional Santiago"
        />
      </label>
      <label>
        Cantidad de mesas
        <input
          type="number"
          min={1}
          max={30}
          value={numMesas}
          onChange={(e) => setNumMesas(e.target.value)}
        />
      </label>
      <label>
        Contraseña del árbitro general
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 4 caracteres"
        />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <div className="admin-form-actions">
        <button className="btn-primary" type="submit">
          Crear torneo
        </button>
        <button
          className="link-btn"
          type="button"
          onClick={() => setAbierto(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function TorneoAdminCard({ torneo }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(torneo.nombre);
  const [password, setPassword] = useState("");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    setNombre(torneo.nombre);
  }, [torneo.nombre]);

  const link = `${window.location.origin}${urlTorneo(torneo.id)}`;

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setAviso("Link copiado");
    } catch (e) {
      setAviso(link);
    }
    setTimeout(() => setAviso(""), 2500);
  };

  const guardar = (e) => {
    e.preventDefault();
    socket.emit(
      "editarTorneo",
      { torneoId: torneo.id, nombre, password: password || undefined },
      (res) => {
        if (res && res.ok) {
          setPassword("");
          setEditando(false);
          setAviso("Cambios guardados");
          setTimeout(() => setAviso(""), 2500);
        } else if (res && res.error === "password-corta") {
          setAviso("La contraseña debe tener al menos 4 caracteres");
        } else {
          setAviso("No se pudo guardar");
        }
      }
    );
  };

  const borrar = () => {
    socket.emit("borrarTorneo", { torneoId: torneo.id }, (res) => {
      setConfirmarBorrado(false);
      if (!res || !res.ok) {
        setAviso(
          res && res.error === "ultimo-torneo"
            ? "No puedes borrar el único torneo que queda"
            : "No se pudo borrar"
        );
        setTimeout(() => setAviso(""), 3000);
      }
    });
  };

  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <div>
          <div className="admin-card-nombre">{torneo.nombre}</div>
          <div className="admin-card-link">{link}</div>
        </div>
        <div className="torneo-card-pills">
          {torneo.resumen.amarillo > 0 && (
            <span className="pill amarillo">{torneo.resumen.amarillo}</span>
          )}
          <span className="pill verde">{torneo.resumen.verde}</span>
        </div>
      </div>

      <div className="admin-card-meta">
        {torneo.numMesas} {torneo.numMesas === 1 ? "mesa" : "mesas"}
      </div>

      {editando && (
        <form className="admin-form" onSubmit={guardar}>
          <label>
            Nombre
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </label>
          <label>
            Nueva contraseña del árbitro general (déjala vacía para no cambiarla)
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sin cambios"
            />
          </label>
          <div className="admin-form-actions">
            <button className="btn-primary" type="submit">
              Guardar
            </button>
            <button
              className="link-btn"
              type="button"
              onClick={() => setEditando(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="admin-card-actions">
        <button className="btn-primary" onClick={() => navigate(urlTorneo(torneo.id))}>
          Abrir
        </button>
        <button className="link-btn" onClick={copiarLink}>
          Copiar link
        </button>
        <button className="link-btn" onClick={() => setEditando((s) => !s)}>
          {editando ? "Cerrar edición" : "Editar"}
        </button>
        {confirmarBorrado ? (
          <>
            <button className="btn-danger-outline" onClick={borrar}>
              Confirmar borrado
            </button>
            <button className="link-btn" onClick={() => setConfirmarBorrado(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button
            className="btn-danger-outline"
            onClick={() => setConfirmarBorrado(true)}
          >
            Borrar
          </button>
        )}
      </div>

      {aviso && <div className="admin-card-aviso">{aviso}</div>}
    </div>
  );
}
