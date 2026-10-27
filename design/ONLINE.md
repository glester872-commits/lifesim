# LIFE//SIM · Online (Alpha-06, beta)

Dos personas, cada una en su navegador o dispositivo, entran en la misma sala privada, se ven andar por la ciudad
con su aspecto y su nombre, y se escriben. Es opcional: sin servidor, o sin entrar en ninguna sala, el juego es el
de siempre, y una caída de red nunca toca la partida ni el guardado.

## Decisión: servidor propio con `ws` (no Supabase)

| | Supabase Realtime | Servidor propio (`ws`) — **elegido** |
|---|---|---|
| Probar hoy, en local, sin cuentas ni costes | No (proyecto, claves, RLS) | Sí |
| Validar movimiento (velocidad, orden, zona) y ritmo | Necesita Edge Functions | En el propio servidor |
| Secretos en el navegador | Clave anon + RLS bien hechas | Ninguno |
| Persistencia/cuentas | Lo trae | No hace falta en el MVP |
| Alojamiento | Gestionado | Un proceso Node con WebSocket (ver abajo) |

El botón **Online** aparece siempre; sin servidor configurado sólo ofrece la etapa 0 de abajo. Un solo backend; la única dependencia nueva es `ws` (dev). Si un día hacen falta cuentas o progreso en la nube,
eso es otra responsabilidad (persistencia) y se decide aparte.

## Arquitectura

```
 Navegador A                                Servidor de salas (Node, server/index.ts)        Navegador B
 ┌──────────────────────────┐              ┌──────────────────────────────────────┐        ┌─────────────┐
 │ Partida LOCAL (no viaja):│              │ Salas en memoria (código 6 letras)   │        │ Igual que A │
 │ dinero, día/hora, NPC,   │              │  · miembros: sesión, nombre, aspecto,│        │             │
 │ inventario, guardado     │  wss (JSON)  │    presencia, última pose            │  wss   │             │
 │                          │              │  · chat: últimos 50, sin disco       │        │             │
 │ ui/OnlinePanel ────────────────────────►│ valida (src/net/protocol):           │◄───────│             │
 │  net/OnlineClient        │◄─────────────│  hola+versión, orden (seq),          │───────►│             │
 │ world/RemotePlayers      │              │  velocidad/zona, ritmo, tamaño       │        │             │
 │  (avatares interpolados) │              │ latido 10 s · espera de vuelta 20 s  │        │             │
 └──────────────────────────┘              └──────────────────────────────────────┘        └─────────────┘
```

**Compartido**: presencia (conectado / reconectando), zona (`LocationDef.id`: la calle o un interior), posición,
orientación y paso del avatar, nombre, aspecto (ids de catálogo: pelo, piel, ojos, ropa; sin tatuajes) y el chat.

**Local**: todo lo demás. Cada uno tiene su propio día y hora: si uno está a las 9:00 y el otro a las 22:00, cada
uno ve su luz y su gente y al otro avatar andando por la misma calle; nadie adelanta el reloj de nadie. Los NPC, las
tiendas y el dinero no se sincronizan. Al cambiar de zona (puerta, metro) el avatar desaparece para quien sigue en
la anterior y aparece donde llega.

## Protocolo (v1, `src/net/protocol.ts`)

Cliente → servidor: `hello {v, playerId, name, look}` · `create` · `join {code}` · `move {seq, pose}` ·
`chat {id, text}` · `leave`. Servidor → cliente: `room {code, you, players, chat}` · `joined` · `presence` ·
`left` · `moved {session, seq, pose}` · `chat {msg}` · `error {code, message}`.
`pose = {zone, x, y, f, m}` (orientación; 0 quieto, 1 andando, 2 corriendo).

- `playerId`: aleatorio por navegador (localStorage), sólo para volver sin clones; **no sale del servidor**. Los
  demás ven un id de sesión distinto. Tras recargar la pestaña se vuelve sola a la sala (sessionStorage, al pulsar
  Continuar); antes de 20 s es la misma sesión.
- Movimiento: como mucho 10 envíos/s y sólo si cambia (latido cada 2 s quieto); el servidor admite 20/s, tira lo
  desordenado (`seq`) y rechaza saltos imposibles en la misma zona (> 600 px/s + 64). Al otro lado se pinta 120 ms
  por detrás, interpolando; un salto grande (puerta) se coloca de golpe.
- Chat: 280 caracteres (un emoji cuenta uno), sin caracteres de control ni giros bidi, 5 mensajes cada 10 s, sin
  repetir el mismo texto, id para no duplicar. Siempre se pinta con `textContent`.
- Límites: 4 KB por mensaje (más, se corta esa conexión), 4 personas por sala, 500 salas, 200 conexiones, 20
  mensajes inválidos y fuera. `ALLOWED_ORIGINS` fija qué webs pueden conectar.
- Bloquear: en este navegador, deja de ver el avatar y los mensajes de esa persona.

## Sin conexión: pasar el aspecto (etapa 0)

En el mismo panel, sin servidor (también en la versión publicada): **Copiar mi aspecto** da un código de texto
(`LIFESIM-ASPECTO-1:…`, JSON versionado en base64url) con el nombre y los ids de catálogo del aspecto; nada de
dinero, bolsa, relaciones, partida ni id del navegador. Quien lo pega en **Invitar** ve a esa persona de pie a su lado,
con la etiqueta «Nombre · invitado (sin conexión)»: no se mueve, no habla, no está en la lista de la sala y no se
guarda (se va con **Despedir**, al recargar o al cerrar). Es una figura, no una persona conectada.

## Probarlo en local con dos clientes

```
npm install
npm run server          # terminal 1 · ws://localhost:8787 (GET /health)
npm run dev             # terminal 2 · http://localhost:5173
```

Abre el juego en dos navegadores distintos (o uno normal y otro en ventana privada, o el móvil en la misma red con
`npx vite --host` y la IP del ordenador). En los dos: partida → botón **Online**. En A: **Crear sala privada**; en B,
el código y **Entrar**. Moveos y escribid. Prueba automática del servidor: `node scripts/check-online.ts`.

## Alojamiento (pendiente de aprobación: no hay nada desplegado)

GitHub Pages sirve el juego (estático) pero **no** puede mantener el servidor WebSocket. Para jugar desde casas
distintas hace falta un proceso Node accesible por `wss://`, por ejemplo Fly.io, Render o Railway, o un VPS pequeño
con Caddy para TLS. Orden de magnitud: de una capa gratuita a unos 5 €/mes para una instancia pequeña siempre
encendida — **precios sin verificar**, compruébalos antes de contratar nada. Pasos: desplegar `server/` con `PORT` y
`ALLOWED_ORIGINS=https://<usuario>.github.io`; compilar el juego con `VITE_ONLINE_URL=wss://<servidor>`. Basta una
instancia: las salas viven en memoria (reiniciar el servidor las cierra; el juego lo dice y sigue offline).

## Qué no hace (todavía)

Salas públicas, cuentas, chat guardado, voz, NPC o economía compartidos, autoridad sobre colisiones (el servidor
valida velocidad y zona, no paredes), varias instancias de servidor, que el invitado sin conexión ande o converse.
