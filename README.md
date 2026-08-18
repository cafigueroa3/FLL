# FLL

## fll-semaforo

Semáforo de mesas para el arbitraje del Juego de Robot en FIRST LEGO League.
Cada árbitro de mesa marca su estado (verde / amarillo / rojo) desde el celular
y el árbitro general los ve todos en una sola pantalla, en tiempo real.

### Cómo correrlo

Clonar el proyecto y después ejecutar:

```bash
cd fll-semaforo/frontend
npm install
npm run build
cd ..
npm start
```

Se puede correr desde:

```bash
En este computador:   http://localhost:3000
Desde otros celulares (misma WiFi): http://192.168.1.87:3000
```

### Varios torneos a la vez

La app soporta varios torneos en simultáneo, cada uno con su propio nombre, su
propia cantidad de mesas y su propia contraseña de árbitro general.

- `/` — lista de torneos disponibles.
- `/t/<id-del-torneo>` — pantalla del torneo (elegir rol). **Este es el link o
  QR que se le reparte a los árbitros de ese torneo.**
- `/t/<id-del-torneo>/general` — panel del árbitro general (pide la contraseña
  de ese torneo).
- `/admin` — panel del superadmin: crear, renombrar, borrar torneos y ver el
  resumen de todos en vivo.

Cada pantalla tiene su propia URL, así que el botón "atrás" del teléfono navega
dentro de la app (mesa → selección de mesa → torneo → lista de torneos) en vez
de cerrarla.

### Contraseñas

Se definen como variables de entorno (ver `fll-semaforo/.env.example`):

- `SUPER_PASSWORD` — superadmin. Administra todos los torneos y puede entrar al
  panel de cualquiera de ellos.
- `HEAD_PASSWORD` — contraseña del árbitro general del primer torneo (el que se
  crea automáticamente la primera vez). Los torneos creados después tienen su
  propia contraseña, que se define al crearlos desde `/admin`.

### Dónde se guarda el estado

En `state.json`. Si existe la variable `RAILWAY_VOLUME_MOUNT_PATH` (volumen
persistente de Railway), el archivo se guarda ahí para que sobreviva a los
reinicios y redeploys; si no, queda junto a `server.js`.
