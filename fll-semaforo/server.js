const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Server } = require("socket.io");

// Carga variables desde un archivo .env en esta misma carpeta, si existe
// (ese archivo va en .gitignore, no se sube al repo). No agrega ninguna
// dependencia nueva: solo entiende líneas "CLAVE=valor", que es todo lo que
// este proyecto necesita. En Railway esto no hace nada (no hay .env en el
// deploy) — ahí la variable se define directo en su panel de Variables.
function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Si Railway tiene un volumen conectado a este servicio, guardamos el estado
// ahí (persiste entre reinicios y redeploys). Si no, se guarda junto a
// server.js como siempre, así que en local funciona igual.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const STATE_FILE = path.join(DATA_DIR, "state.json");
const DIST_DIR = path.join(__dirname, "frontend", "dist");
const DEFAULT_NUM_MESAS = 8;
const MAX_MESAS = 30;
const VALID_LIGHTS = ["verde", "amarillo", "rojo"];

// Contraseña del ÁRBITRO GENERAL por defecto: se le asigna al torneo que se
// crea automáticamente la primera vez (o al migrar el estado antiguo). Desde
// el panel de administración cada torneo puede tener la suya propia.
const DEFAULT_HEAD_PASSWORD = process.env.HEAD_PASSWORD || "fll2026";

// Contraseña del SUPERADMIN: crea, renombra y borra torneos, y puede entrar al
// panel de cualquier torneo sin saber su contraseña. Se define con la variable
// de entorno SUPER_PASSWORD (en .env para local, en el panel de Railway para
// producción).
const SUPER_PASSWORD = process.env.SUPER_PASSWORD || DEFAULT_HEAD_PASSWORD;

const ADMIN_ROOM = "superadmins";
const roomOf = (torneoId) => `torneo:${torneoId}`;

/* ------------------------------------------------------------------ *
 * Estado
 *
 * Formato en disco (version 2):
 * {
 *   "version": 2,
 *   "torneos": {
 *     "<id>": { id, nombre, numMesas, password, createdAt, tables: {...} }
 *   }
 * }
 * ------------------------------------------------------------------ */

function slugify(texto) {
  const base = String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "torneo";
}

function idUnico(base, torneos) {
  let id = base;
  let n = 2;
  while (torneos[id]) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function normalizarTorneo(t, idFallback) {
  const id = String(t.id || idFallback);
  return {
    id,
    nombre: String(t.nombre || "Torneo").slice(0, 60),
    numMesas: Math.max(
      1,
      Math.min(MAX_MESAS, Number(t.numMesas) || DEFAULT_NUM_MESAS)
    ),
    password: typeof t.password === "string" ? t.password : DEFAULT_HEAD_PASSWORD,
    createdAt: Number(t.createdAt) || Date.now(),
    tables: t.tables && typeof t.tables === "object" ? t.tables : {},
  };
}

function estadoInicial() {
  return {
    version: 2,
    torneos: {
      principal: normalizarTorneo(
        {
          id: "principal",
          nombre: "Torneo principal",
          numMesas: DEFAULT_NUM_MESAS,
          password: DEFAULT_HEAD_PASSWORD,
        },
        "principal"
      ),
    },
  };
}

function loadState() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (e) {
    return estadoInicial();
  }

  // Formato nuevo
  if (parsed && parsed.torneos && typeof parsed.torneos === "object") {
    const torneos = {};
    for (const [id, t] of Object.entries(parsed.torneos)) {
      torneos[id] = normalizarTorneo(t, id);
    }
    if (!Object.keys(torneos).length) return estadoInicial();
    return { version: 2, torneos };
  }

  // Formato antiguo (un solo torneo suelto): lo migramos sin perder nada.
  if (parsed && (parsed.tables || parsed.numMesas)) {
    console.log("Migrando state.json al formato de varios torneos...");
    return {
      version: 2,
      torneos: {
        principal: normalizarTorneo(
          {
            id: "principal",
            nombre: "Torneo principal",
            numMesas: parsed.numMesas,
            password: DEFAULT_HEAD_PASSWORD,
            tables: parsed.tables,
            createdAt: Date.now(),
          },
          "principal"
        ),
      },
    };
  }

  return estadoInicial();
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("No se pudo guardar state.json:", e.message);
  }
}

let state = loadState();
saveState(); // deja el archivo ya migrado al formato nuevo

/* ------------------------------------------------------------------ *
 * Vistas públicas del estado (nunca incluyen la contraseña)
 * ------------------------------------------------------------------ */

function torneoPublico(t) {
  return {
    id: t.id,
    nombre: t.nombre,
    numMesas: t.numMesas,
    tables: t.tables,
  };
}

function resumen(t) {
  const conteo = { verde: 0, amarillo: 0, rojo: 0 };
  for (let n = 1; n <= t.numMesas; n += 1) {
    const luz = t.tables[n]?.light;
    conteo[VALID_LIGHTS.includes(luz) ? luz : "rojo"] += 1;
  }
  return conteo;
}

function listaTorneos() {
  return Object.values(state.torneos)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t) => ({
      id: t.id,
      nombre: t.nombre,
      numMesas: t.numMesas,
      createdAt: t.createdAt,
      resumen: resumen(t),
    }));
}

function emitirTorneo(t) {
  io.to(roomOf(t.id)).emit("state", torneoPublico(t));
  // El superadmin ve el resumen de todos los torneos en vivo.
  io.to(ADMIN_ROOM).emit("torneos", listaTorneos());
}

function emitirLista() {
  io.emit("torneos", listaTorneos());
}

/* ------------------------------------------------------------------ *
 * Web
 * ------------------------------------------------------------------ */

if (!fs.existsSync(DIST_DIR)) {
  console.log("");
  console.log("No se encontro frontend/dist.");
  console.log("Antes de iniciar el servidor, corre esto una sola vez:");
  console.log("  cd frontend");
  console.log("  npm install");
  console.log("  npm run build");
  console.log("  cd ..");
  console.log("Luego vuelve a correr: npm start");
  console.log("");
  process.exit(1);
}

app.use(express.static(DIST_DIR));
// Cualquier ruta (/, /admin, /t/lo-que-sea/...) devuelve la misma app; el
// ruteo lo resuelve el frontend.
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

/* ------------------------------------------------------------------ *
 * Sockets
 * ------------------------------------------------------------------ */

function esGeneralDe(socket, torneoId) {
  return socket.data.isSuper || socket.data.headOf.has(torneoId);
}

io.on("connection", (socket) => {
  socket.data.isSuper = false;
  socket.data.headOf = new Set();

  socket.emit("torneos", listaTorneos());

  socket.on("listTorneos", (ack) => {
    if (typeof ack === "function") ack(listaTorneos());
  });

  // Entrar a un torneo: el socket se suscribe solo a los cambios de ese torneo.
  socket.on("joinTorneo", (torneoId, ack) => {
    const t = state.torneos[torneoId];
    if (!t) {
      if (typeof ack === "function") ack({ ok: false });
      return;
    }
    for (const room of [...socket.rooms]) {
      if (room.startsWith("torneo:")) socket.leave(room);
    }
    socket.join(roomOf(t.id));
    if (typeof ack === "function") ack({ ok: true, torneo: torneoPublico(t) });
  });

  // Árbitro general de UN torneo. La contraseña del superadmin también sirve.
  socket.on("authHead", (payload, ack) => {
    const torneoId = payload && payload.torneoId;
    const password = payload && payload.password;
    const t = state.torneos[torneoId];
    const ok =
      Boolean(t) &&
      typeof password === "string" &&
      (password === t.password || password === SUPER_PASSWORD);
    if (ok) socket.data.headOf.add(torneoId);
    else socket.data.headOf.delete(torneoId);
    if (typeof ack === "function") ack(ok);
  });

  // Superadmin: administra todos los torneos.
  socket.on("authSuper", (password, ack) => {
    const ok = typeof password === "string" && password === SUPER_PASSWORD;
    socket.data.isSuper = ok;
    if (ok) socket.join(ADMIN_ROOM);
    else socket.leave(ADMIN_ROOM);
    if (typeof ack === "function") ack(ok);
  });

  socket.on("setLight", ({ torneoId, mesa, light } = {}) => {
    const t = state.torneos[torneoId];
    if (!t || !mesa || !VALID_LIGHTS.includes(light)) return;
    const n = Number(mesa);
    if (!Number.isInteger(n) || n < 1 || n > t.numMesas) return;
    t.tables[n] = { light, updatedAt: Date.now() };
    saveState();
    emitirTorneo(t);
  });

  socket.on("setNumMesas", ({ torneoId, numMesas } = {}) => {
    const t = state.torneos[torneoId];
    if (!t || !esGeneralDe(socket, torneoId)) return;
    t.numMesas = Math.max(
      1,
      Math.min(MAX_MESAS, Number(numMesas) || DEFAULT_NUM_MESAS)
    );
    saveState();
    emitirTorneo(t);
    emitirLista();
  });

  socket.on("resetAll", ({ torneoId } = {}) => {
    const t = state.torneos[torneoId];
    if (!t || !esGeneralDe(socket, torneoId)) return;
    for (let n = 1; n <= t.numMesas; n += 1) {
      t.tables[n] = { light: "rojo", updatedAt: Date.now() };
    }
    saveState();
    emitirTorneo(t);
  });

  /* ---------------- Administración de torneos (solo superadmin) --------- */

  socket.on("crearTorneo", ({ nombre, numMesas, password } = {}, ack) => {
    if (!socket.data.isSuper) {
      if (typeof ack === "function") ack({ ok: false, error: "no-autorizado" });
      return;
    }
    const nombreLimpio = String(nombre || "").trim().slice(0, 60);
    if (!nombreLimpio) {
      if (typeof ack === "function") ack({ ok: false, error: "nombre-vacio" });
      return;
    }
    const pass = String(password || "").trim();
    if (pass.length < 4) {
      if (typeof ack === "function") ack({ ok: false, error: "password-corta" });
      return;
    }
    const id = idUnico(slugify(nombreLimpio), state.torneos);
    state.torneos[id] = normalizarTorneo(
      {
        id,
        nombre: nombreLimpio,
        numMesas,
        password: pass,
        createdAt: Date.now(),
        tables: {},
      },
      id
    );
    saveState();
    emitirLista();
    if (typeof ack === "function") ack({ ok: true, id });
  });

  // Renombrar y/o cambiar la contraseña. El id (y por lo tanto el link) no
  // cambia nunca, para no romper los QR ya repartidos.
  socket.on("editarTorneo", ({ torneoId, nombre, password } = {}, ack) => {
    const t = state.torneos[torneoId];
    if (!socket.data.isSuper || !t) {
      if (typeof ack === "function") ack({ ok: false, error: "no-autorizado" });
      return;
    }
    if (typeof nombre === "string" && nombre.trim()) {
      t.nombre = nombre.trim().slice(0, 60);
    }
    if (typeof password === "string" && password.trim()) {
      const pass = password.trim();
      if (pass.length < 4) {
        if (typeof ack === "function") ack({ ok: false, error: "password-corta" });
        return;
      }
      t.password = pass;
    }
    saveState();
    emitirLista();
    emitirTorneo(t);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("borrarTorneo", ({ torneoId } = {}, ack) => {
    if (!socket.data.isSuper || !state.torneos[torneoId]) {
      if (typeof ack === "function") ack({ ok: false, error: "no-autorizado" });
      return;
    }
    if (Object.keys(state.torneos).length <= 1) {
      if (typeof ack === "function") ack({ ok: false, error: "ultimo-torneo" });
      return;
    }
    delete state.torneos[torneoId];
    saveState();
    io.to(roomOf(torneoId)).emit("torneoEliminado", torneoId);
    emitirLista();
    if (typeof ack === "function") ack({ ok: true });
  });
});

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("Servidor Semaforo FLL corriendo:");
  console.log(`  En este computador:   http://localhost:${PORT}`);
  const ips = getLocalIPs();
  if (ips.length) {
    console.log("  Desde otros celulares (misma WiFi):");
    ips.forEach((ip) => console.log(`    http://${ip}:${PORT}`));
  } else {
    console.log("  No se detecto una IP de red local. Verifica tu conexion WiFi.");
  }
  console.log(`  Estado guardado en: ${STATE_FILE}`);
  console.log(`  Torneos activos: ${Object.keys(state.torneos).length}`);
  if (process.env.SUPER_PASSWORD) {
    console.log("  Password de superadmin: definida por variable de entorno SUPER_PASSWORD");
  } else {
    console.log(`  Password de superadmin (por defecto, cambiala con SUPER_PASSWORD): ${SUPER_PASSWORD}`);
  }
  console.log("  Panel de administracion: /admin");
  console.log("");
});
