import { TILE } from '../config/constants';
import type { LocationDef } from '../types/game';
import { PROPS } from './tiles';
import { blend, clipped, ellipse, hash, line, poly, rect, rgba, rng, smooth, softShadow, speckle, tone, type Ctx } from './HdKit';

/**
 * Suelo Visual V3 (design/VISUAL_V3.md), pintado en coordenadas de mundo sobre
 * el lienzo HD del sitio. Nada se pinta por tile: cada material tiene su propio
 * aparejo (baldosa de 10 px, losa de 20 × 10, adoquín de 5) que nunca cae en la
 * rejilla de 16, variación de tono por manchas amplias y accidentes con motivo
 * (desgaste en la rodada, mugre al pie de la fachada, hojas bajo los árboles).
 */

const ASPHALT = '#3d4049';
const BIKE = '#7a4536';
const LINE = '#e4dfd2';
const SIDEWALK = '#a9a398';
const GRANITE = '#b9b1a1';
const GRANITE_DARK = '#7d776d';
const KERB = '#c7c0b2';
const GRASS = '#5a7d3c';
const SOIL = '#5e4a36';
const IRON = '#262b28';

type At = (tx: number, ty: number) => string;

/** Las celdas de un carácter como un camino de recorte. */
function cellsPath(ctx: Ctx, def: LocationDef, chars: string): void {
  def.ground.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) if (chars.includes(row[tx])) ctx.rect(tx * TILE, ty * TILE, TILE, TILE);
  });
}

const ROAD = new Set(['.', '=', 'b', 'z', ':']);
const WALK = new Set([',', 'P', 'T']);

// ------------------------------------------------------------------ calzada

function asphalt(ctx: Ctx, def: LocationDef, at: At, w: number, h: number): void {
  clipped(ctx, () => cellsPath(ctx, def, '.=bz:'), () => {
    rect(ctx, ASPHALT, 0, 0, w, h);
    // Manchas de reasfaltado y el brillo gastado de la rodada.
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const n = smooth(x, y, 70, 3) * 0.05 + smooth(x, y, 18, 4) * 0.02;
        if (Math.abs(n) > 0.012) rect(ctx, n > 0 ? rgba('#ffffff', n * 0.9) : rgba('#000000', -n * 1.2), x, y, 2, 2);
      }
    }
    // Árido: grano fino, claro y oscuro.
    speckle(ctx, rgba('#d8d4cc', 0.22), 0, 0, w, h, Math.floor(w * h * 0.35), 11);
    speckle(ctx, rgba('#14161b', 0.35), 0, 0, w, h, Math.floor(w * h * 0.25), 12);
    // Rodadas: dos bandas por carril, algo más oscuras y pulidas.
    def.ground.forEach((row, ty) => {
      if (row[0] !== '=' && row[0] !== '.') return;
      for (const off of [4, 11]) {
        const y = ty * TILE + off;
        ctx.fillStyle = rgba('#101217', 0.13);
        ctx.fillRect(0, y, w, 2.2);
        ctx.fillStyle = rgba('#ffffff', 0.025);
        ctx.fillRect(0, y + 0.5, w, 0.6);
      }
    });
    // Carril bici: rojo teja, gastado por el centro.
    def.ground.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (row[tx] !== 'b') continue;
        ctx.fillStyle = rgba(BIKE, 0.82);
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    });
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
      const ty = Math.floor(y / TILE);
      if (at(Math.floor(x / TILE), ty) !== 'b') continue;
      const n = smooth(x, y, 30, 8);
      if (n > 0.25) rect(ctx, rgba('#2a1c18', (n - 0.25) * 0.35), x, y, 3, 3);
    }
    // Grietas selladas con alquitrán: largas, con quiebros, más junto a los bordillos.
    const r = rng(77);
    for (let i = 0; i < Math.floor(w / 40); i++) {
      let x = r() * w;
      let y = 0;
      // Elige una fila de calzada.
      const rows = def.ground.map((row, ty) => (ROAD.has(row[0]) && row[0] !== 'z' ? ty : -1)).filter((t) => t >= 0);
      if (!rows.length) break;
      y = rows[Math.floor(r() * rows.length)] * TILE + 2 + r() * 12;
      const pts = [x, y];
      for (let s = 0; s < 6; s++) {
        x += 3 + r() * 6;
        y += (r() - 0.5) * 3;
        pts.push(x, y);
      }
      line(ctx, rgba('#0d0e12', 0.55), 0.55, pts);
      line(ctx, rgba('#ffffff', 0.06), 0.25, pts.map((v, k) => (k % 2 ? v - 0.4 : v)));
    }
    // Parches de reasfaltado: rectángulos de borde mordido, algo más negros.
    for (let i = 0; i < Math.floor(w / 90); i++) {
      const rows = def.ground.map((row, ty) => (row[0] === '.' || row[0] === '=' ? ty : -1)).filter((t) => t >= 0);
      const px0 = r() * (w - 30);
      const py0 = rows[Math.floor(r() * rows.length)] * TILE + 2;
      // Borde irregular y poco contraste: un parche se nota de cerca; de lejos no debe parecer la sombra de un coche.
      const pw = 10 + r() * 22;
      const ph = 5 + r() * 6;
      const pts: number[] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        pts.push(px0 + pw / 2 + Math.cos(a) * (pw / 2) * (0.8 + r() * 0.2), py0 + ph / 2 + Math.sin(a) * (ph / 2) * (0.75 + r() * 0.25));
      }
      poly(ctx, rgba('#24262c', 0.22), pts);
      line(ctx, rgba('#0d0e12', 0.3), 0.35, [...pts, pts[0], pts[1]]);
      speckle(ctx, rgba('#d8d4cc', 0.12), px0, py0, pw, ph, Math.floor(pw * ph * 0.5), Math.floor(px0));
    }
  });
  // Marcas viales: pintura termoplástica con su desgaste.
  const paint = (x: number, y: number, ww: number, hh: number, a = 0.92): void => {
    ctx.fillStyle = rgba(LINE, a);
    ctx.fillRect(x, y, ww, hh);
    for (let i = 0; i < ww * hh * 0.6; i++) {
      const v = hash(Math.floor(x * 7 + i), Math.floor(y * 3), 31);
      if (v < 0.25) rect(ctx, rgba(ASPHALT, 0.55), x + hash(i, 1, Math.floor(x)) * ww, y + hash(i, 2, Math.floor(y)) * hh, 0.5, 0.5);
    }
  };
  def.ground.forEach((row, ty) => {
    const Y = ty * TILE;
    // Línea central continua y las de borde del carril bici.
    if (row.includes('=')) for (let x = 0; x < w; x += 1) if (at(Math.floor(x / TILE), ty) === '=') paint(x, Y + TILE - 1.2, 1, 1.0);
    if (row.includes('b')) {
      const kerbAbove = WALK.has(at(0, ty - 1));
      for (let x = 0; x < w; x++) if (at(Math.floor(x / TILE), ty) === 'b') paint(x, kerbAbove ? Y + TILE - 1.4 : Y + 0.4, 1, 0.9);
      // Bici y flecha pintadas, cada tanto.
      for (let tx = 2; tx < row.length; tx += 9) {
        if (row[tx] !== 'b') continue;
        bikeGlyph(ctx, tx * TILE + 3, Y + 5.5, kerbAbove ? -1 : 1);
      }
    }
  });
  // Paso de cebra: bandas anchas y largas, en el sentido del tráfico, con el gris de las rodadas.
  def.ground.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      if (row[tx] !== 'z') continue;
      if (row[tx - 1] === 'z') continue;
      let end = tx;
      while (row[end + 1] === 'z') end++;
      const x0 = tx * TILE + 1;
      const x1 = (end + 1) * TILE - 1;
      for (let y = ty * TILE + 1.5; y < (ty + 1) * TILE - 1; y += 8) paint(x0, y, x1 - x0, 4.6, 0.95);
    }
  });
}

/** La bici y la flecha del carril, en pintura blanca. */
function bikeGlyph(ctx: Ctx, x: number, y: number, dir: number): void {
  ctx.strokeStyle = rgba(LINE, 0.85);
  ctx.lineWidth = 0.6;
  for (const cx of [x + 1.6, x + 7.4]) {
    ctx.beginPath();
    ctx.arc(cx, y + 2.6, 1.9, 0, Math.PI * 2);
    ctx.stroke();
  }
  line(ctx, rgba(LINE, 0.85), 0.6, [x + 1.6, y + 2.6, x + 3.8, y + 0.4, x + 6.4, y + 0.4, x + 7.4, y + 2.6, x + 4.6, y + 2.6, x + 3.8, y + 0.4]);
  const ax = x + 12;
  line(ctx, rgba(LINE, 0.85), 0.8, dir > 0 ? [ax, y + 2.6, ax + 5, y + 2.6, ax + 3.2, y + 1.0] : [ax + 5, y + 2.6, ax, y + 2.6, ax + 1.8, y + 1.0]);
}

// ------------------------------------------------------------------ aceras

/** Baldosa de pastillas de Madrid, de 10 px: cuatro botones por pieza, en tandas de tono. */
function sidewalk(ctx: Ctx, def: LocationDef, w: number, h: number): void {
  clipped(ctx, () => cellsPath(ctx, def, ','), () => {
    rect(ctx, tone(SIDEWALK, -0.2), 0, 0, w, h);
    const S = 10;
    for (let y = -3; y < h; y += S) {
      for (let x = -7; x < w; x += S) {
        const n = smooth(x, y, 60, 21) * 0.05 + (hash(x, y, 5) - 0.5) * 0.04;
        let c = tone(SIDEWALK, n);
        if (hash(x, y, 9) < 0.03) c = blend(c, '#c9c4ba', 0.5); // pieza repuesta, más nueva
        rect(ctx, c, x + 0.2, y + 0.2, S - 0.4, S - 0.4);
        // Los cuatro botones con su luz arriba a la izquierda.
        for (const [bx, by] of [[2.5, 2.5], [7.5, 2.5], [2.5, 7.5], [7.5, 7.5]]) {
          ellipse(ctx, tone(c, -0.07), x + bx + 0.25, y + by + 0.25, 1.55, 1.55);
          ellipse(ctx, tone(c, 0.05), x + bx - 0.15, y + by - 0.15, 1.3, 1.3);
        }
        if (hash(x, y, 13) < 0.04) line(ctx, rgba('#3a352f', 0.35), 0.3, [x + 1 + hash(x, y, 14) * 6, y + 0.5, x + 3 + hash(x, y, 15) * 5, y + S * 0.6, x + 2 + hash(x, y, 16) * 6, y + S - 0.5]);
      }
    }
    speckle(ctx, rgba('#ffffff', 0.08), 0, 0, w, h, Math.floor(w * h * 0.06), 41);
    speckle(ctx, rgba('#2a2620', 0.15), 0, 0, w, h, Math.floor(w * h * 0.05), 42);
  });
}

/**
 * La plazuela: campo de losa clara de 20 × 10 a matajunta, cenefa de granito
 * oscuro en el borde, un anillo de adoquín oscuro alrededor de la boca de metro
 * (la escena se ordena en torno a ella) y una canaleta de fundición.
 */
function plaza(ctx: Ctx, def: LocationDef, at: At, w: number, h: number): void {
  const metro = def.buildings?.find((b) => b.style === 'metro');
  clipped(ctx, () => cellsPath(ctx, def, 'P'), () => {
    rect(ctx, tone(GRANITE, -0.24), 0, 0, w, h);
    // Losas de 10 de alto y largos mezclados (15, 20, 25, 30): sin un módulo fijo, la plaza no se lee como rejilla.
    for (let row = 0; row * 10 < h; row++) {
      const y = row * 10 + 2;
      let x = -30 + hash(row, 3) * 14;
      for (let i = 0; x < w; i++) {
        const len = 15 + Math.floor(hash(row, i, 54) * 4) * 5;
        const n = smooth(x, y, 90, 51) * 0.07 + (hash(x, y, 52) - 0.5) * 0.09;
        let c = tone(GRANITE, n);
        const t = hash(x, y, 53);
        if (t < 0.14) c = blend(c, '#c4a884', 0.2);
        else if (t > 0.88) c = blend(c, '#9aa0a8', 0.18);
        rect(ctx, c, x + 0.25, y + 0.25, len - 0.5, 9.5);
        rect(ctx, tone(c, 0.06), x + 0.25, y + 0.25, len - 0.5, 0.5);
        rect(ctx, tone(c, -0.07), x + 0.25, y + 9.25, len - 0.5, 0.5);
        // Grano del granito: motas y algún cristal de mica.
        speckle(ctx, rgba('#3e3a35', 0.28), x, y, len, 10, Math.round(len * 1.3), Math.floor(x * 31 + y * 7));
        speckle(ctx, rgba('#ffffff', 0.35), x, y, len, 10, Math.round(len * 0.3), Math.floor(x * 13 + y * 17));
        // Alguna losa partida y recebada.
        if (hash(x, y, 55) < 0.06) line(ctx, rgba('#2a2620', 0.45), 0.3, [x + len * 0.3, y + 0.5, x + len * 0.45, y + 5, x + len * 0.4, y + 9.5]);
        x += len;
      }
    }
    // Desgaste de gran escala: por donde pasa la gente el granito está más pulido; en los bordes, más sucio.
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const n = smooth(x, y, 64, 57) * 0.6 + smooth(x, y, 22, 58) * 0.4;
        if (n > 0.08) rect(ctx, rgba('#ffffff', Math.min(0.06, (n - 0.08) * 0.25)), x, y, 4, 4);
        else if (n < -0.08) rect(ctx, rgba('#2a241e', Math.min(0.08, (-n - 0.08) * 0.3)), x, y, 4, 4);
      }
    }
    if (metro) {
      // Anillo de adoquín oscuro de 1 tile alrededor de la boca, con su cenefa.
      const x0 = metro.tx * TILE - 12;
      const y0 = metro.ty * TILE - 6;
      const x1 = (metro.tx + metro.w) * TILE + 12;
      const y1 = (metro.ty + metro.h) * TILE + 14;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      rect(ctx, tone(GRANITE_DARK, -0.25), x0, y0, x1 - x0, y1 - y0);
      for (let y = y0; y < y1; y += 5) {
        for (let x = x0 - ((y / 5) % 2) * 2.5; x < x1; x += 5) {
          const c = tone(GRANITE_DARK, (hash(x, y, 61) - 0.5) * 0.12 + smooth(x, y, 30, 62) * 0.04);
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.roundRect(x + 0.3, y + 0.3, 4.4, 4.4, 0.8);
          ctx.fill();
          rect(ctx, tone(c, 0.08), x + 0.6, y + 0.4, 3.6, 0.5);
        }
      }
      ctx.restore();
      ctx.strokeStyle = tone(GRANITE_DARK, -0.35);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x0 + 0.6, y0 + 0.6, x1 - x0 - 1.2, y1 - y0 - 1.2);
      ctx.strokeStyle = rgba('#ffffff', 0.12);
      ctx.lineWidth = 0.4;
      ctx.strokeRect(x0 + 1.4, y0 + 1.4, x1 - x0 - 2.8, y1 - y0 - 2.8);
    }
    // Cenefa: dos hiladas de granito oscuro donde la plaza toca otra cosa.
    def.ground.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (row[tx] !== 'P') continue;
        const X = tx * TILE;
        const Y = ty * TILE;
        const edge = (dx: number, dy: number): boolean => !'PT'.includes(at(tx + dx, ty + dy) || '-');
        ctx.fillStyle = tone(GRANITE_DARK, -0.05);
        if (edge(0, -1)) ctx.fillRect(X, Y, TILE, 3);
        if (edge(0, 1)) ctx.fillRect(X, Y + TILE - 3, TILE, 3);
        if (edge(-1, 0)) ctx.fillRect(X, Y, 3, TILE);
        if (edge(1, 0)) ctx.fillRect(X + TILE - 3, Y, 3, TILE);
      }
    });
    // Manchas de uso: café, chicles y la sombra húmeda de los alcorques.
    const r = rng(91);
    for (let i = 0; i < w * h * 0.0006; i++) {
      const x = r() * w;
      const y = r() * h;
      ellipse(ctx, rgba('#2a241e', 0.08 + r() * 0.08), x, y, 0.5 + r() * 1.5, 0.4 + r() * 1.1);
    }
  });
  // Franja podotáctil: amarilla, de botones, con su cenefa.
  clipped(ctx, () => cellsPath(ctx, def, 'T'), () => {
    rect(ctx, '#c9a646', 0, 0, w, h);
    def.ground.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (row[tx] !== 'T') continue;
        for (let y = 1.6; y < TILE; y += 3.2) for (let x = 1.6; x < TILE; x += 3.2) {
          ellipse(ctx, '#8f7426', tx * TILE + x + 0.25, ty * TILE + y + 0.3, 1.0, 1.0);
          ellipse(ctx, '#e3c45e', tx * TILE + x - 0.1, ty * TILE + y - 0.1, 0.85, 0.85);
        }
        rect(ctx, rgba('#5c4a1a', 0.5), tx * TILE, ty * TILE, TILE, 0.4);
      }
    });
  });
}

// ------------------------------------------------------------------ verde

function grass(ctx: Ctx, def: LocationDef, w: number, h: number): void {
  clipped(ctx, () => cellsPath(ctx, def, 'gd'), () => {
    rect(ctx, SOIL, 0, 0, w, h);
    // Capas: tierra que asoma, hierba en tres verdes por manchas, matas de briznas.
    for (let y = 0; y < h; y += 1.5) {
      for (let x = 0; x < w; x += 1.5) {
        const n = smooth(x, y, 26, 71) + smooth(x, y, 8, 72) * 0.4;
        if (n < -0.75) continue; // calva de tierra
        const c = n > 0.35 ? '#6e9448' : n > -0.1 ? GRASS : '#476a30';
        rect(ctx, c, x, y, 1.6, 1.6);
      }
    }
    const r = rng(73);
    for (let i = 0; i < w * h * 0.05; i++) {
      const x = r() * w;
      const y = r() * h;
      const c = r() < 0.5 ? '#3b5a27' : '#7ea456';
      line(ctx, c, 0.35, [x, y, x + (r() - 0.5) * 1.2, y - 1.2 - r() * 1.6]);
    }
    for (let i = 0; i < w * h * 0.0015; i++) {
      const x = r() * w;
      const y = r() * h;
      const c = r() < 0.6 ? '#f1ece0' : '#e8c86a';
      for (let k = 0; k < 3; k++) ellipse(ctx, c, x + (r() - 0.5) * 3, y + (r() - 0.5) * 2, 0.45, 0.45);
    }
  });
  // Bordillo jardinero: un listón de granito donde la tierra toca la acera.
  def.ground.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      if (row[tx] !== 'g') continue;
      const X = tx * TILE;
      const Y = ty * TILE;
      const n = (dx: number, dy: number): boolean => WALK.has(def.ground[ty + dy]?.[tx + dx] ?? '-');
      ctx.fillStyle = KERB;
      if (n(0, -1)) {
        ctx.fillRect(X, Y, TILE, 1.4);
        rect(ctx, rgba('#000000', 0.25), X, Y + 1.4, TILE, 0.5);
      }
      if (n(0, 1)) {
        ctx.fillStyle = KERB;
        ctx.fillRect(X, Y + TILE - 1.4, TILE, 1.4);
        rect(ctx, rgba('#ffffff', 0.3), X, Y + TILE - 1.4, TILE, 0.35);
      }
      if (n(-1, 0)) { ctx.fillStyle = KERB; ctx.fillRect(X, Y, 1.4, TILE); }
      if (n(1, 0)) { ctx.fillStyle = KERB; ctx.fillRect(X + TILE - 1.4, Y, 1.4, TILE); }
    }
  });
}

// ------------------------------------------------------------------ bordes

/** Bordillo de granito con volumen entre acera y calzada: canto con luz, cara en sombra y la cuneta. */
function kerbs(ctx: Ctx, def: LocationDef, at: At): void {
  def.ground.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      if (!WALK.has(row[tx]) && row[tx] !== 'g') continue;
      const X = tx * TILE;
      const Y = ty * TILE;
      const below = at(tx, ty + 1);
      const above = at(tx, ty - 1);
      const lowered = below === 'z' || above === 'z';
      if (ROAD.has(below)) {
        // La calzada queda abajo: canto del bordillo, su cara vertical en sombra y la sombra en la cuneta.
        const hgt = lowered ? 0.8 : 2.2;
        rect(ctx, KERB, X, Y + TILE - 2.6, TILE, 2.6);
        rect(ctx, tone(KERB, 0.12), X, Y + TILE - 2.6, TILE, 0.6);
        for (let k = 0; k < TILE; k += 8) rect(ctx, tone(KERB, -0.2), X + k + ((ty * 5) % 8), Y + TILE - 2.6, 0.3, 2.6);
        rect(ctx, tone(KERB, -0.32), X, Y + TILE, TILE, hgt);
        rect(ctx, rgba('#0c0d10', 0.4), X, Y + TILE + hgt, TILE, 1.4);
        rect(ctx, rgba('#0c0d10', 0.18), X, Y + TILE + hgt + 1.4, TILE, 1.6);
      }
      if (ROAD.has(above)) {
        rect(ctx, KERB, X, Y, TILE, 2.4);
        rect(ctx, tone(KERB, 0.14), X, Y, TILE, 0.5);
        rect(ctx, rgba('#ffffff', 0.08), X, Y + 2.4, TILE, 0.6);
        rect(ctx, rgba('#0c0d10', 0.3), X, Y - 1.2, TILE, 1.2);
      }
    }
  });
}

/**
 * Oclusión y sombras de contacto horneadas: el pie de cada fachada, el de cada
 * prop (banco, farola, tótem, papelera) y el alcorque de cada árbol en el
 * pavimento. Blandas, nunca manchas negras.
 */
function contact(ctx: Ctx, def: LocationDef, at: At): void {
  for (const b of def.buildings ?? []) {
    if (b.style === 'metro') continue;
    const y = (b.ty + b.h) * TILE;
    const g = ctx.createLinearGradient(0, y, 0, y + 12);
    g.addColorStop(0, rgba('#120e1a', 0.42));
    g.addColorStop(0.35, rgba('#120e1a', 0.16));
    g.addColorStop(1, rgba('#120e1a', 0));
    ctx.fillStyle = g;
    ctx.fillRect(b.tx * TILE, y, b.w * TILE, 12);
    // Mugre de la acera al pie de la pared: salpicaduras de lluvia.
    speckle(ctx, rgba('#3a3128', 0.3), b.tx * TILE, y, b.w * TILE, 2.5, b.w * 18, b.tx * 13 + 1);
  }
  for (const p of def.props) {
    const prop = PROPS[p.kind];
    if (prop.flat) continue;
    const wide = (prop.tilesWide ?? 1) * TILE;
    const cx = p.tx * TILE + wide / 2;
    const cy = (p.ty + 1) * TILE - 2;
    if (p.kind === 'plane-tree' || p.kind === 'tree') {
      const paved = WALK.has(at(p.tx, p.ty));
      if (paved) treePit(ctx, cx, cy - 1);
      softShadow(ctx, cx + 2, cy, 9, 3.2, 0.35);
      // Hojas caídas alrededor, como calcomanía.
      const r = rng(p.tx * 97 + p.ty);
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2;
        const d = 6 + Math.sqrt(r()) * 22;
        const x = cx + Math.cos(a) * d;
        const y = cy + Math.sin(a) * d * 0.45;
        const c = ['#b88046', '#9a6a3a', '#c9a13a', '#7a8a3c'][Math.floor(r() * 4)];
        ellipse(ctx, rgba(c, 0.85), x, y, 0.9, 0.5, r() * 3);
      }
      continue;
    }
    const [sw, sh] = prop.shadow ?? [wide - 4, 4];
    softShadow(ctx, cx + 1.5, cy, sw * 0.62, sh * 0.7, 0.42);
  }
}

/** Alcorque: rejilla de fundición cuadrada con el tronco en medio. */
function treePit(ctx: Ctx, cx: number, cy: number): void {
  const s = 13;
  rect(ctx, tone(GRANITE_DARK, -0.15), cx - s / 2 - 1, cy - s / 2 - 1, s + 2, s + 2);
  rect(ctx, IRON, cx - s / 2, cy - s / 2, s, s);
  ctx.strokeStyle = tone(IRON, 0.25);
  ctx.lineWidth = 0.35;
  for (let r = 2; r < s / 2; r += 1.6) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < 8; a++) line(ctx, tone(IRON, 0.18), 0.35, [cx, cy, cx + Math.cos((a * Math.PI) / 4) * (s / 2), cy + Math.sin((a * Math.PI) / 4) * (s / 2)]);
  rect(ctx, rgba('#ffffff', 0.12), cx - s / 2, cy - s / 2, s, 0.4);
  ellipse(ctx, SOIL, cx, cy, 2.6, 2.2);
}

/** Lo plano que va en el suelo: tapas de registro y rejillas. */
function flats(ctx: Ctx, def: LocationDef): void {
  for (const p of def.props) {
    const cx = p.tx * TILE + 8;
    const cy = p.ty * TILE + 8;
    if (p.kind === 'manhole') {
      ellipse(ctx, tone(IRON, -0.1), cx + 0.3, cy + 0.4, 6.2, 6.2);
      ellipse(ctx, '#3b3f3c', cx, cy, 5.8, 5.8);
      ctx.strokeStyle = '#4b504c';
      ctx.lineWidth = 0.35;
      for (let i = -5; i <= 5; i += 1.4) line(ctx, '#2a2e2b', 0.5, [cx - Math.sqrt(Math.max(0, 30 - i * i)), cy + i, cx + Math.sqrt(Math.max(0, 30 - i * i)), cy + i]);
      ellipse(ctx, rgba('#ffffff', 0.12), cx - 2, cy - 3, 2.5, 0.8);
      ctx.font = 'bold 1.6px sans-serif';
      ctx.fillStyle = rgba('#7c827d', 0.8);
      ctx.textAlign = 'center';
      ctx.fillText('MADRID', cx, cy + 0.6);
    } else if (p.kind === 'drain') {
      rect(ctx, '#2b2f2c', cx - 6, cy - 3, 12, 6);
      for (let x = cx - 5; x < cx + 5.5; x += 1.4) rect(ctx, '#121413', x, cy - 2.2, 0.7, 4.4);
      rect(ctx, rgba('#ffffff', 0.15), cx - 6, cy - 3, 12, 0.4);
    }
  }
}

/** Pinta todo el suelo del sitio (px de mundo) en el lienzo HD. */
export function paintHdGround(ctx: Ctx, def: LocationDef): void {
  const w = def.ground[0].length * TILE;
  const h = def.ground.length * TILE;
  const at: At = (tx, ty) => def.ground[ty]?.[tx] ?? '';
  grass(ctx, def, w, h);
  asphalt(ctx, def, at, w, h);
  sidewalk(ctx, def, w, h);
  plaza(ctx, def, at, w, h);
  kerbs(ctx, def, at);
  flats(ctx, def);
  contact(ctx, def, at);
}
