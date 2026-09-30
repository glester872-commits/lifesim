import Phaser from 'phaser';

/**
 * Sombra de farola: de noche, quien pasa cerca de una farola encendida echa
 * una sombra larga y tenue hacia el lado contrario, más corta y marcada cuanto
 * más cerca está. world/Lighting publica aquí las farolas y cuánto de noche
 * es (y el color del cielo, para teñir el primer plano: world/Foreground); los
 * personajes (entities/Character, entities/Player) la leen al moverse.
 * Una imagen por persona y una búsqueda entre las farolas del sitio: barato.
 */
export const LAMP_LIGHT: { night: number; lamps: { x: number; y: number }[]; sky: number } = { night: 0, lamps: [], sky: 0xffffff };

/** Hasta dónde llega la sombra de una farola, en px de mundo. */
const REACH = 72;

/** Coloca la sombra de farola de quien tiene los pies en (x, y); sin farola cerca o de día, oculta. */
export function lampShadow(img: Phaser.GameObjects.Image, x: number, y: number, visible = true): void {
  if (!visible || LAMP_LIGHT.night < 0.25) {
    img.setVisible(false);
    return;
  }
  let best: { x: number; y: number } | undefined;
  let bestD = REACH;
  for (const l of LAMP_LIGHT.lamps) {
    const d = Math.hypot(x - l.x, y - l.y);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  if (!best || bestD < 3) {
    img.setVisible(false);
    return;
  }
  const near = 1 - bestD / REACH;
  img
    .setVisible(true)
    .setPosition(x, y - 1)
    .setDepth(y - 1)
    .setRotation(Math.atan2(y - best.y, x - best.x))
    .setScale(0.7 + (1 - near) * 0.8, 1)
    .setAlpha(Math.min(1, near * 1.4) * LAMP_LIGHT.night * 0.55);
}
