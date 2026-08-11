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

const STATE_FILE = path.join(__dirname, "state.json");
const DIST_DIR = path.join(__dirname, "frontend", "dist");
const DEFAULT_NUM_MESAS = 8;
const VALID_LIGHTS = ["verde", "amarillo", "rojo"];

// Contraseña para entrar como "árbitro general" (ver vista y reiniciar/mesas).
// Se puede definir en fll-semaforo/.env (HEAD_PASSWORD=tu_contraseña) para
// desarrollo local, o como variable de entorno HEAD_PASSWORD en Railway para
// producción. Si no se define en ningún lado, usa el valor por defecto.
const HEAD_PASSWORD = process.env.HEAD_PASSWORD || "fll2026";

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      numMesas: parsed.numMesas || DEFAULT_NUM_MESAS,
      tables: parsed.tables || {},
    };
  } catch (e) {
    return { numMesas: DEFAULT_NUM_MESAS, tables: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

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
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

io.on("connection", (socket) => {
  socket.data.isHead = false;
  socket.emit("state", state);

  // El árbitro general se autentica con una contraseña compartida (sin base de
  // datos). Mientras el socket no esté marcado como "isHead", el servidor
  // ignora los eventos de administración (setNumMesas, resetAll).
  socket.on("authHead", (password, ack) => {
    const ok = typeof password === "string" && password === HEAD_PASSWORD;
    socket.data.isHead = ok;
    if (typeof ack === "function") ack(ok);
  });

  socket.on("setLight", ({ mesa, light }) => {
    if (!mesa || !VALID_LIGHTS.includes(light)) return;
    state.tables[mesa] = { light, updatedAt: Date.now() };
    saveState(state);
    io.emit("state", state);
  });

  socket.on("setNumMesas", (numMesas) => {
    if (!socket.data.isHead) return;
    const n = Math.max(1, Math.min(30, Number(numMesas) || DEFAULT_NUM_MESAS));
    state.numMesas = n;
    saveState(state);
    io.emit("state", state);
  });

  socket.on("resetAll", () => {
    if (!socket.data.isHead) return;
    for (const mesa of Object.keys(state.tables)) {
      state.tables[mesa] = { light: "rojo", updatedAt: Date.now() };
    }
    saveState(state);
    io.emit("state", state);
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
  if (process.env.HEAD_PASSWORD) {
    console.log("  Password de arbitro general: definida por variable de entorno HEAD_PASSWORD");
  } else {
    console.log(`  Password de arbitro general (por defecto, cambiala con HEAD_PASSWORD): ${HEAD_PASSWORD}`);
  }
  console.log("");
});
