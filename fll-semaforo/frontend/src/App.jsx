import { useState, useEffect } from "react";
import { io } from "socket.io-client";

const socket = io();

const LIGHTS = {
  verde: { label: "Listo para iniciar" },
  amarillo: { label: "Necesito ayuda" },
  rojo: { label: "No listo" },
};

const DEFAULT_NUM_MESAS = 8;

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

function useSharedState() {
  const [state, setState] = useState({ numMesas: DEFAULT_NUM_MESAS, tables: {} });
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onState = (s) => setState(s);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("state", onState);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("state", onState);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return { state, connected };
}

export default function App() {
  const [view, setView] = useState("home");
  const { state, connected } = useSharedState();

  return (
    <div className="app">
      {!connected && (
        <div className="offline-banner">
          Sin conexión al servidor — revisa que estés en la misma red WiFi
        </div>
      )}
      {view === "home" && <Home setView={setView} />}
      {view === "referee" && (
        <RefereeView goHome={() => setView("home")} state={state} />
      )}
      {view === "head" && <HeadView goHome={() => setView("home")} state={state} />}
    </div>
  );
}

function TopBar({ title, goHome }) {
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={goHome}>
        <ArrowLeftIcon className="" />
      </button>
      <h2 className="topbar-title">{title}</h2>
    </div>
  );
}

function Home({ setView }) {
  return (
    <div className="page center">
      <div className="home-header">
        <BrandMark />
        <h1 className="home-title">Semáforo de Mesas</h1>
        <p className="home-subtitle">
          Juego de Robot: indica el estado de tu mesa o supervisa todas las
          mesas desde una sola pantalla.
        </p>
      </div>

      <div className="home-grid">
        <button className="role-card role-referee" onClick={() => setView("referee")}>
          <div className="role-badge">M</div>
          <div>
            <div className="role-title">Soy árbitro de mesa</div>
            <div className="role-desc">Selecciona tu mesa y enciende tu luz</div>
          </div>
        </button>

        <button className="role-card role-head" onClick={() => setView("head")}>
          <div className="role-badge">G</div>
          <div>
            <div className="role-title">Soy árbitro general</div>
            <div className="role-desc">Ve el estado de todas las mesas</div>
          </div>
        </button>
      </div>
    </div>
  );
}

function RefereeView({ goHome, state }) {
  const [mesa, setMesa] = useState(() => {
    const saved = localStorage.getItem("fll-last-mesa");
    return saved ? Number(saved) : null;
  });
  const [saving, setSaving] = useState(false);

  const chooseMesa = (n) => {
    setMesa(n);
    localStorage.setItem("fll-last-mesa", String(n));
  };

  const setLight = (light) => {
    if (!mesa) return;
    setSaving(true);
    socket.emit("setLight", { mesa, light });
    setTimeout(() => setSaving(false), 300);
  };

  if (!mesa) {
    return (
      <div className="page">
        <TopBar title="Selecciona tu mesa" goHome={goHome} />
        <div className="page center" style={{ padding: 0 }}>
          <p className="mesa-hint">Toca la letra de tu mesa</p>
          <div className="mesa-grid">
            {Array.from({ length: state.numMesas }, (_, i) => i + 1).map((n) => (
              <button key={n} className="mesa-btn" onClick={() => chooseMesa(n)}>
                {mesaLabel(n)}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const status = state.tables[mesa];
  const current = status?.light || "rojo";
  const conf = LIGHTS[current];

  return (
    <div className="page">
      <TopBar title={`Mesa ${mesaLabel(mesa)}`} goHome={goHome} />
      <div className="page center" style={{ padding: 0, gap: 32 }}>
        <button className="change-mesa" onClick={() => setMesa(null)}>
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

function HeadView({ goHome, state }) {
  const [showSettings, setShowSettings] = useState(false);
  const [draftNum, setDraftNum] = useState(state.numMesas);

  useEffect(() => {
    setDraftNum(state.numMesas);
  }, [state.numMesas]);

  const saveNumMesas = () => {
    socket.emit("setNumMesas", draftNum);
    setShowSettings(false);
  };

  const rows = Array.from({ length: state.numMesas }, (_, i) => i + 1).map((n) => ({
    mesa: n,
    light: state.tables[n]?.light || "rojo",
    updatedAt: state.tables[n]?.updatedAt || null,
    registered: Boolean(state.tables[n]),
  }));

  const order = { amarillo: 0, rojo: 1, verde: 2 };
  const sorted = [...rows].sort((a, b) => order[a.light] - order[b.light]);

  const needHelp = rows.filter((r) => r.light === "amarillo").length;
  const ready = rows.filter((r) => r.light === "verde").length;

  return (
    <div className="page">
      <div className="topbar-row">
        <TopBar title="Panel del árbitro general" goHome={goHome} />
        <button className="icon-btn" onClick={() => setShowSettings((s) => !s)}>
          <SettingsIcon className="" />
        </button>
      </div>

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
          <button
            className="btn-danger-outline"
            onClick={() => {
              if (confirm("¿Poner todas las mesas en rojo?")) {
                socket.emit("resetAll");
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
        {sorted.map((r) => (
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
