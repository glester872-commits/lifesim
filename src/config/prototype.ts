/**
 * Sesión de prototipo (design/VISUAL_V3.md): con `?proto` en la URL, el juego
 * arranca en la plazuela del prototipo Visual V3 y no guarda partida, para que
 * mirarlo no toque la partida de siempre. Sin el parámetro, nada cambia.
 * Un build con `VITE_PROTO=1` arranca siempre así (una vista previa que no
 * puede pasar parámetros por la URL).
 */
export const PROTOTYPE_SESSION =
  import.meta.env?.VITE_PROTO === '1' || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('proto'));
export const PROTOTYPE_LOCATION = 'plazuela-v3';
