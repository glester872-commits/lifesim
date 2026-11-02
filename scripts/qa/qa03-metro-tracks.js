// QA-03 · nadie de la estación pisa la vía (systems/MetroSystem.watchStuck). Regresión de navegador: con el juego en una
// estación (lifesim.game.scene.getScene('World').metroSystem), pegar esta función en evaluate_script (sourcePath).
//
// 1. Ciclos normales de tren a 60 fps (game.step): ningún pasajero ni vigilante visible con los pies por encima del borde
//    del andén (fila edgeRow), en ningún estado del tren, y la guarda no salta (no hay «pisaba la vía» en el registro).
// 2. Con el tren ausente, llegando, parado con las puertas abiertas y saliendo: se mete a la fuerza a dos pasajeros en
//    marcha y al vigilante en la vía; al fotograma siguiente están en el andén, y unos segundos después siguen en el andén
//    y se mueven (no quedan atascados).
async () => {
  const g = lifesim.game, W = g.scene.getScene('World'), m = W.metroSystem;
  if (!m) return 'no estás en una estación';
  const S = lifesim.services;
  while (S.dialogue.isOpen) S.dialogue.close();
  if (S.menu.isOpen) S.menu.close();
  S.clock.release?.();
  S.clock.setPaused?.(false);
  g.loop.sleep();
  window.__t = Math.max(window.__t || 0, performance.now() + 5000);
  const step = (n) => { for (let i = 0; i < n; i++) g.step((window.__t += 16), 16); };
  const edge = m.trackBottom;
  const people = () => [...m.passengers.map((p) => ['pasajero', p.state, p.walker]), ...m.guards.map((q) => ['vigilante', q.state, q.walker])];
  const notes = () => m.log.filter((l) => String(l).includes('pisaba la vía')).length;

  // 1 · ciclos normales.
  const before = notes();
  const invaded = [];
  let cycles = 0, last = m.train.state;
  const states = new Set();
  for (let f = 0; f < 60 * 60 * 4; f++) {
    step(1);
    states.add(m.train.state);
    if (last !== 'AWAY' && m.train.state === 'AWAY') cycles++;
    last = m.train.state;
    if (f % 4) continue;
    for (const [kind, st, w] of people()) if (w.visible && w.y < edge) invaded.push(`${kind}/${st}/${m.train.state} y=${Math.round(w.y)}`);
  }
  const normal = { cycles, states: [...states], invaded: invaded.slice(0, 5), guardFired: notes() - before };

  // 2 · a la fuerza, con el tren en cada estado.
  const forced = [];
  for (const want of ['AWAY', 'ARRIVING', 'BOARDING', 'DEPARTING']) {
    for (let f = 0; f < 60 * 120 && m.train.state !== want; f++) step(1);
    if (m.train.state !== want) { forced.push({ want, skipped: true }); continue; }
    const victims = [...m.passengers.filter((p) => p.walker.visible && p.walker.moving).slice(0, 2).map((p) => ['pasajero', p.walker]), ...m.guards.filter((q) => q.walker.visible).slice(0, 1).map((q) => ['vigilante', q.walker])];
    for (const [, w] of victims) w.place({ x: w.x, y: 3 * 16 }, 'up');
    step(1);
    const now = victims.map(([k, w]) => `${k}:${Math.round(w.y)}`);
    const xs = victims.map(([, w]) => w.x + w.y);
    step(60 * 4);
    const later = victims.map(([k, w]) => ({ k, y: Math.round(w.y), visible: w.visible, onPlatform: !w.visible || w.y >= edge }));
    const moved = victims.some(([, w], i) => !w.visible || Math.abs(w.x + w.y - xs[i]) > 1);
    forced.push({ want, train: m.train.state, victims: victims.length, nextFrame: now, later, moved });
  }
  const pass = normal.invaded.length === 0 && normal.guardFired === 0 && forced.every((f) => f.skipped || (f.nextFrame.every((s) => Number(s.split(':')[1]) >= edge) && f.later.every((l) => l.onPlatform) && f.moved));
  return { pass, edge, normal, forced };
}
