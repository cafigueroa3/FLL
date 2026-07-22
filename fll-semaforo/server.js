const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const STATE_FILE = path.join(__dirname, "state.json");
const DIST_DIR = path.join(__dirname, "frontend", "dist");
const DEFAULT_NUM_MESAS = 8;
const VALID_LIGHTS = ["verde", "amarillo", "rojo"];

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
  socket.emit("state", state);

  socket.on("setLight", ({ mesa, light }) => {
    if (!mesa || !VALID_LIGHTS.includes(light)) return;
    state.tables[mesa] = { light, updatedAt: Date.now() };
    saveState(state);
    io.emit("state", state);
  });

  socket.on("setNumMesas", (numMesas) => {
    const n = Math.max(1, Math.min(30, Number(numMesas) || DEFAULT_NUM_MESAS));
    state.numMesas = n;
    saveState(state);
    io.emit("state", state);
  });

  socket.on("resetAll", () => {
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
  console.log("");
});
