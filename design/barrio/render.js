// Renderizador de exploración (no es código del juego). Pinta una propuesta de
// barrio a partir de rectángulos, con la PALETTE real de src/config/constants.ts,
// y calcula trayectos a pie por el grafo de peatones con los números del juego.
const P = {
  ink: '#0e0f16', night: '#171a24', asphalt: '#262a36', roadLine: '#7f8471',
  pavement: '#414757', pavementLit: '#4b5265', cobble: '#5b4f48', plaza: '#4c4856', plazaLit: '#565162',
  grass: '#2f4a39', grassDark: '#273d30', water: '#22394a', waterLit: '#3d6478', ballast: '#2a2c33', sleeper: '#3d3a38',
  roofA: '#2f2a3a', roofALit: '#3a3446', roofB: '#3a3140', roofBLit: '#463b4d',
  wall: '#443c4d', wallLit: '#51475b', stone: '#565b6b', stoneLit: '#636979', brick: '#6a4740', brickLit: '#7a544c',
  glass: '#26424e', glassLit: '#6fd0c6', amber: '#f0b46a', amberDim: '#a8743e', wood: '#5d4733', woodLit: '#6d5540',
  rug: '#79454f', leaf: '#38644a', leafLit: '#487a59', metal: '#555c6d', metalLit: '#68707f', white: '#e8e3da',
};

// Juego: PLAYER_SPEED 76 px/s, TILE 16 → 4,75 tiles/s; reloj a 2 min de juego por s real.
const TILES_PER_S = 76 / 16;
const GAME_MIN_PER_S = 2;

const GROUND = {
  asphalt: P.asphalt, sidewalk: P.pavement, cobble: P.cobble, plaza: P.plaza, grass: P.grass,
  water: P.water, rail: P.ballast, dirt: P.grassDark, court: P.wallLit,
};

// Fachada: color de muro, color de huecos y si lleva escaparate corrido.
const FACADE = {
  home: { wall: P.wallLit, win: P.amber, roof: P.roofB },
  res: { wall: P.brick, win: P.amberDim, roof: P.roofA },
  res2: { wall: P.stone, win: P.amberDim, roof: P.roofB },
  res3: { wall: P.wall, win: P.glass, roof: P.roofA },
  gym: { wall: P.metal, win: P.glassLit, roof: P.roofBLit, band: true },
  cafe: { wall: P.wood, win: P.amber, roof: P.roofB, awning: P.amber },
  fashion: { wall: P.white, win: P.glassLit, roof: P.roofALit, band: true, awning: P.ink },
  super: { wall: P.stone, win: P.glassLit, roof: P.roofA, band: true, awning: P.leafLit },
  rest: { wall: P.brick, win: P.amber, roof: P.roofB, awning: P.rug },
  office: { wall: P.glass, win: P.glassLit, roof: P.stone, band: true },
  study: { wall: P.stoneLit, win: P.glass, roof: P.roofALit },
  pharmacy: { wall: P.stone, win: P.glass, roof: P.roofA, cross: true },
  closed: { wall: P.metal, win: P.metalLit, roof: P.roofA, shutter: true },
  bank: { wall: P.stoneLit, win: P.glass, roof: P.roofB, awning: P.amberDim },
  civic: { wall: P.stoneLit, win: P.glass, roof: P.roofA },
  shop: { wall: P.wallLit, win: P.glassLit, roof: P.roofBLit, awning: P.leaf },
  works: { wall: P.metal, win: P.amber, roof: P.ballast, shutter: true },
  metro: { wall: P.stone, win: P.glassLit, roof: P.stone },
  back: { wall: P.wall, win: P.wall, roof: P.roofA },
};

const NODE_COLOR = { edge: P.white, door: P.amber, wait: P.glassLit, meet: '#e07a8f', spawn: '#9fd36b', path: P.white };

function render(spec, canvas, opts) {
  const S = opts.scale;
  canvas.width = spec.w * S;
  canvas.height = spec.h * S;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x * S, y * S, w * S, h * S); };

  rect(0, 0, spec.w, spec.h, P.grass);
  // Ruido determinista en la hierba: rompe el plano sin cuadricular.
  for (let y = 0; y < spec.h; y++) for (let x = 0; x < spec.w; x++) {
    if ((x * 7 + y * 13) % 11 === 0) rect(x + 0.3, y + 0.4, 0.2, 0.2, P.grassDark);
  }

  for (const a of spec.ground) {
    rect(a.x, a.y, a.w, a.h, GROUND[a.t]);
    if (a.t === 'cobble' || a.t === 'plaza') {
      for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) {
        if ((x + y * 3) % 5 === 0) rect(x + 0.1, y + 0.6, 0.8, 0.08, a.t === 'plaza' ? P.plazaLit : P.brick);
      }
    }
    if (a.t === 'rail') for (let x = a.x; x < a.x + a.w; x++) rect(x + 0.2, a.y, 0.3, a.h, P.sleeper);
    if (a.lane) for (let x = a.x; x < a.x + a.w; x += 3) rect(x, a.y + a.h / 2 - 0.06, 1.4, 0.12, P.roadLine);
    if (a.laneV) for (let y = a.y; y < a.y + a.h; y += 3) rect(a.x + a.w / 2 - 0.06, y, 0.12, 1.4, P.roadLine);
    // Las bandas van en el sentido del tráfico: 'ew' cruza una calle este-oeste.
    if (a.zebra === 'ew') for (let y = a.y; y < a.y + a.h; y += 0.5) rect(a.x, y, a.w, 0.25, P.white);
    if (a.zebra === 'ns') for (let x = a.x; x < a.x + a.w; x += 0.5) rect(x, a.y, 0.25, a.h, P.white);
  }

  for (const b of spec.buildings) drawBuilding(g, rect, b, S);
  for (const p of spec.props) drawProp(g, rect, p, S);

  if (opts.graph && spec.graph) drawGraph(g, spec.graph, S);

  // Números de edificio, legibles sobre cualquier tejado.
  g.font = `700 ${Math.max(9, S * 1.1)}px ui-monospace, Consolas, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  spec.buildings.forEach((b) => {
    if (!b.n) return;
    const cx = (b.x + b.w / 2) * S;
    const cy = (b.y + b.h / 2 - (b.facade === 's' ? 0.5 : -0.5)) * S;
    const r = S * 1.05;
    g.fillStyle = b.access ? P.amber : P.ink;
    g.strokeStyle = b.access ? P.ink : P.white;
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = b.access ? P.ink : P.white;
    g.fillText(String(b.n), cx, cy + 0.5);
  });
  for (const l of spec.labels ?? []) {
    g.font = `600 ${Math.max(9, S * 0.95)}px ui-sans-serif, system-ui, sans-serif`;
    g.fillStyle = 'rgba(232,227,218,0.72)';
    g.fillText(l.text, l.x * S, l.y * S);
  }
}

function drawBuilding(g, rect, b, S) {
  const f = FACADE[b.type];
  rect(b.x, b.y, b.w, b.h, f.roof);
  // Canto de tejado y chimeneas: cada bloque con su silueta.
  rect(b.x, b.y, b.w, 0.2, 'rgba(255,255,255,0.06)');
  for (let i = 0; i < (b.chimneys ?? 0); i++) rect(b.x + 1 + ((i * 5 + b.x) % Math.max(1, b.w - 2)), b.y + 1, 0.6, 0.6, P.wall);
  if (!b.facade) return;
  const fh = b.tall ? 2 : 1;
  const fy = b.facade === 's' ? b.y + b.h - fh : b.y;
  rect(b.x, fy, b.w, fh, f.wall);
  const winY = fy + fh - 0.8;
  for (let x = b.x; x < b.x + b.w; x++) {
    if (f.band) rect(x + 0.05, winY, 0.95, 0.55, f.win);
    else if (f.shutter) { rect(x + 0.1, winY, 0.8, 0.6, f.win); rect(x + 0.1, winY + 0.2, 0.8, 0.08, P.ink); }
    else if ((x - b.x) % 2 === 1) rect(x + 0.25, winY, 0.5, 0.5, f.win);
    if (b.tall) for (let yy = fy; yy < fy + 1; yy++) if ((x - b.x) % 2 === 0) rect(x + 0.25, yy + 0.2, 0.5, 0.45, f.win);
  }
  if (f.awning) {
    const ay = b.facade === 's' ? b.y + b.h : b.y - 0.35;
    for (let x = b.x; x < b.x + b.w; x++) rect(x, ay, 1, 0.35, (x % 2) ? f.awning : P.white);
  }
  if (f.cross) rect(b.x + b.w - 1.4, fy + 0.1, 0.8, 0.8, P.leafLit);
  for (const d of b.doors ?? []) rect(d[0] + 0.15, d[1] + 0.1, 0.7, 0.9, b.access ? P.amber : P.ink);
}

function drawProp(g, rect, p, S) {
  const c = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x * S, y * S, r * S, 0, Math.PI * 2); g.fill(); };
  switch (p.k) {
    case 'tree': c(p.x + 0.5, p.y + 0.5, 0.75, P.leaf); c(p.x + 0.35, p.y + 0.35, 0.35, P.leafLit); break;
    case 'bench': rect(p.x, p.y + 0.3, p.w ?? 1, 0.4, P.woodLit); break;
    case 'lamp': c(p.x + 0.5, p.y + 0.5, 0.18, P.amber); break;
    case 'car': rect(p.x + 0.05, p.y + 0.1, (p.w ?? 2) - 0.1, (p.h ?? 1) - 0.2, p.c ?? P.rug); rect(p.x + 0.4, p.y + 0.25, 0.6, (p.h ?? 1) - 0.5, P.glass); break;
    case 'bike': rect(p.x, p.y + 0.4, 1, 0.2, P.metalLit); c(p.x + 0.2, p.y + 0.5, 0.15, P.white); c(p.x + 0.8, p.y + 0.5, 0.15, P.white); break;
    case 'terrace': c(p.x + 0.5, p.y + 0.5, 0.55, p.c ?? P.amber); c(p.x + 0.5, p.y + 0.5, 0.15, P.white); break;
    case 'fountain': c(p.x, p.y, 1.6, P.stone); c(p.x, p.y, 1.2, P.waterLit); c(p.x, p.y, 0.3, P.white); break;
    case 'bin': rect(p.x + 0.35, p.y + 0.3, 0.3, 0.4, P.leafLit); break;
    case 'vending': rect(p.x + 0.1, p.y, 0.8, 0.9, P.glassLit); break;
    case 'kiosk': rect(p.x, p.y, p.w ?? 2, 1, P.leaf); rect(p.x, p.y, p.w ?? 2, 0.3, P.amber); break;
    case 'planter': rect(p.x + 0.1, p.y + 0.2, (p.w ?? 1) - 0.2, 0.6, P.woodLit); c(p.x + (p.w ?? 1) / 2, p.y + 0.35, 0.3, P.leafLit); break;
    case 'stop': rect(p.x, p.y, p.w ?? 3, 0.4, P.glassLit); rect(p.x, p.y + 0.4, p.w ?? 3, 0.2, P.metal); break;
    case 'atm': rect(p.x + 0.2, p.y, 0.6, 0.6, P.amber); break;
    case 'hoop': rect(p.x, p.y, 0.3, 0.3, P.amber); break;
    case 'fence': rect(p.x, p.y + 0.4, p.w ?? 1, 0.15, P.amber); break;
  }
}

function drawGraph(g, graph, S) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  g.strokeStyle = 'rgba(232,227,218,0.55)';
  g.lineWidth = 1.5;
  g.setLineDash([3, 3]);
  for (const [a, b] of graph.edges) {
    const A = byId.get(a), B = byId.get(b);
    g.beginPath(); g.moveTo((A.x + 0.5) * S, (A.y + 0.5) * S); g.lineTo((B.x + 0.5) * S, (B.y + 0.5) * S); g.stroke();
  }
  g.setLineDash([]);
  for (const n of graph.nodes) {
    g.fillStyle = NODE_COLOR[n.kind];
    const r = n.kind === 'path' ? S * 0.28 : S * 0.5;
    g.beginPath(); g.arc((n.x + 0.5) * S, (n.y + 0.5) * S, r, 0, Math.PI * 2); g.fill();
    if (n.kind !== 'path') { g.strokeStyle = P.ink; g.lineWidth = 1; g.stroke(); }
  }
}

/** Dijkstra sobre el grafo. Devuelve tiles o Infinity si no hay camino. */
function walk(graph, from, to) {
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const [a, b] of graph.edges) {
    const d = Math.hypot(byId.get(a).x - byId.get(b).x, byId.get(a).y - byId.get(b).y);
    adj.get(a).push([b, d]); adj.get(b).push([a, d]);
  }
  const dist = new Map([[from, 0]]);
  const open = new Set([from]);
  while (open.size) {
    let cur = null;
    for (const id of open) if (cur === null || dist.get(id) < dist.get(cur)) cur = id;
    open.delete(cur);
    if (cur === to) return dist.get(cur);
    for (const [nb, d] of adj.get(cur)) {
      const nd = dist.get(cur) + d;
      if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); open.add(nb); }
    }
  }
  return Infinity;
}

function mount(spec) {
  document.title = `Barrio · ${spec.title}`;
  document.querySelector('[data-title]').textContent = spec.title;
  document.querySelector('[data-thesis]').textContent = spec.thesis;
  document.querySelector('[data-form]').textContent = spec.form;
  document.querySelector('[data-size]').textContent =
    `${spec.w} × ${spec.h} tiles · ${spec.w * 16} × ${spec.h * 16} px · cruzarlo de lado a lado a pie: ` +
    `${(spec.w / TILES_PER_S).toFixed(0)} s reales = ${Math.round((spec.w / TILES_PER_S) * GAME_MIN_PER_S)} min de juego`;

  const canvas = document.querySelector('canvas');
  const toggle = document.querySelector('[data-graph]');
  const draw = () => render(spec, canvas, { scale: 12, graph: toggle.checked });
  toggle.addEventListener('change', draw);
  draw();

  const list = document.querySelector('[data-buildings]');
  for (const b of spec.buildings.filter((b) => b.n)) {
    const li = document.createElement('li');
    li.className = b.access ? 'is-access' : '';
    li.innerHTML = `<b>${b.n}</b><span>${b.name}</span><em>${b.access ? 'interior' : b.future ?? 'ambiental'}</em>`;
    list.append(li);
  }

  const trips = document.querySelector('[data-trips]');
  for (const [label, a, b] of spec.trips ?? []) {
    const tiles = walk(spec.graph, a, b);
    const tr = document.createElement('tr');
    const s = tiles / TILES_PER_S;
    tr.innerHTML = Number.isFinite(tiles)
      ? `<td>${label}</td><td>${Math.round(tiles)} t</td><td>${s.toFixed(0)} s</td><td>${Math.round(s * GAME_MIN_PER_S)} min</td>`
      : `<td>${label}</td><td colspan="3" class="bad">sin camino en el grafo</td>`;
    trips.append(tr);
  }
  window.__ready = true;
}
