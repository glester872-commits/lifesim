# LIFE//SIM — reglas del proyecto

Simulador de vida 2D cenital. Phaser 3 + TypeScript + Vite. Sin React, sin
backend, sin assets binarios.

Lee `README.md` antes de tocar nada: contiene la arquitectura y el alcance real.

## Límites que no se cruzan

- **Nada de funcionalidad falsa.** Un gráfico provisional vale; un botón o una
  puerta que no hace nada, no. Si una feature no está implementada, no debe
  existir su afordancia.
- **Sin condicionales por localización.** No `if (location === 'home')`. Calle,
  piso, cafetería, andenes y el segundo distrito salen de la misma `WorldScene`
  alimentada por `data/locations.ts`. Un sitio nuevo es una entrada de datos, y
  un paso con coste es un `fare`/`minutes` en su portal.
- **Las Scenes coordinan, no acumulan.** Estado en `state/`, reglas en
  `systems/`, contenido en `data/`, render en `world/` y `entities/`.
- **Nada de arte binario.** Todo se dibuja en `world/` (`TextureFactory`,
  `BuildingArt`, `PropArt`, con las primitivas de `paint.ts`) desde
  `PALETTE` en `config/constants.ts`. Un prop puede ocupar varios tiles
  (`tilesWide`/`tilesHigh`), pero sólo colisiona su fila base.
- **Los edificios del barrio son datos, no rejilla.** Un `BuildingDef` genera
  su fachada, su puerta, su portal y el spawn de delante. Un local sin interior
  no lleva `enter`: puerta dibujada y ninguna afordancia. Los NPC futuros van a
  `points` con nombre por `route()`, nunca a coordenadas escritas.
- **`any` sólo con justificación escrita.** El proyecto usa
  `erasableSyntaxOnly`: no hay parameter properties en constructores.

## Alcance

El roadmap del README es contexto, no permiso. No implementes trabajo,
estudios, habilidades, economía, relaciones ni eventos salvo petición explícita.

## Antes de dar algo por terminado

```bash
npm run build     # tsc + bundle; debe pasar sin errores
npm run check     # recorre el mundo y simula metro y eventos
npm run dev       # y comprobarlo en el navegador de verdad
```

Comprueba a mano: caminar, colisiones, entrar y salir de un edificio, hablar con
un NPC, coger el metro (cobra €2 y 15 min), que el reloj avanza, recargar y
recuperar la partida.

## Estética

Pixel art urbano contemporáneo, acogedor, ligeramente futurista. El mundo es el
protagonista visual; el HUD es discreto. Nada de estética SaaS: sin cards, sin
glassmorphism, sin gradientes de producto IA, sin decoración sin función.

Al añadir texturas, cuidado con los patrones que se repiten cada dos tiles: a
zoom de juego se leen como lunares. Varía con ruido determinista, no con
recuadros alternos.
