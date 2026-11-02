// QA-03 / QA-04 · nadie de la estación pisa la vía (PassengerAI.go valida los destinos; MetroSystem.watchStuck es la red
// excepcional; MetroSystem.trackDiag lo cuenta). Regresión de navegador: con el juego en una estación
// (lifesim.game.scene.getScene('World').metroSystem), pegar esta función en evaluate_script (sourcePath), o dejar que la
// lance scripts/qa/run-qa03.mjs (Chrome headless). `window.__qa03Cycles` cambia el número de ciclos (20 por defecto).
//
// 1. Naturales: N ciclos completos de tren a 60 fps con un tirón de 300 ms cada ~2 s (game.step). Ni un pie en la vía tras
//    ningún paso de física, y los contadores (destinos inválidos, invasiones, transiciones, guarda) a cero. Atascos: se
//    cuentan (el vigía de siempre), sin umbral.
// 2. Provocadas: con el tren ausente, llegando, abierto y saliendo, se mete a la fuerza en la vía a dos pasajeros y al
//    vigilante: la guarda salta una vez por cada uno, al fotograma siguiente están en el andén, los pasajeros siguen su
//    camino (se van o desaparecen por la salida) y el vigilante vuelve a su puesto.
async () => {
  const CYCLES = window.__qa03Cycles ?? 20;
  const HITCH = 300;
  const g = lifesim.game, W = g.scene.getScene('World'), m = W.metroSystem;
  if (!m) return 'no estás en una estación';
  const S = lifesim.services;
  while (S.dialogue.isOpen) S.dialogue.close();
  if (S.menu.isOpen) S.menu.close();
  S.clock.release?.();
  S.clock.setPaused?.(false);
  g.loop.sleep();
  window.__t = Math.max(window.__t || 0, performance.now() + 5000);
  const step = (n, dt = 16) => { for (let i = 0; i < n; i++) g.step((window.__t += dt), dt); };
  const edge = m.trackBottom;
  const diag = () => ({ ...m.trackDiag });
  const delta = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, b[k] - a[k]]));

  // 1 · naturales.
  const d0 = diag();
  const onTrack = [];
  const afterPhysics = () => {
    for (const p of m.passengers) if (p.walker.visible && p.walker.y < edge) onTrack.push(`pasajero ${p.state}/${m.train.state} y=${Math.round(p.walker.y)}`);
    for (const q of m.guards) if (q.walker.visible && q.walker.y < edge) onTrack.push(`vigilante ${q.state} y=${Math.round(q.walker.y)}`);
  };
  W.physics.world.on('worldstep', afterPhysics);
  let cycles = 0, last = m.train.state, f = 0, boarded = 0, alighted = 0, gates = 0;
  const states = new Set();
  const seen = new Map();
  const t0 = performance.now();
  while (cycles < CYCLES && f < 60 * 60 * 40) {
    step(1, f % 120 === 119 ? HITCH : 16);
    states.add(m.train.state);
    if (last !== 'AWAY' && m.train.state === 'AWAY') cycles++;
    last = m.train.state;
    for (const [i, p] of m.passengers.entries()) {
      const prev = seen.get(i);
      if (prev !== p.state) {
        if (p.state === 'RIDING') boarded++;
        if (p.state === 'EXITING_TRAIN') alighted++;
        if (prev === 'ENTERING_STATION' && p.state === 'WALKING_TO_PLATFORM') gates++;
        seen.set(i, p.state);
      }
    }
    f++;
  }
  const simMs = performance.now() - t0;
  W.physics.world.off('worldstep', afterPhysics);
  const natural = { cycles, frames: f, msPerFrame: +(simMs / f).toFixed(3), states: [...states], boarded, alighted, throughGates: gates, onTrackAfterPhysics: onTrack.length, sample: onTrack.slice(0, 5), diag: delta(d0, diag()) };

  // 2 · provocadas.
  const forced = [];
  for (const want of ['AWAY', 'ARRIVING', 'BOARDING', 'DEPARTING']) {
    for (let i = 0; i < 60 * 120 && m.train.state !== want; i++) step(1);
    if (m.train.state !== want) { forced.push({ want, skipped: true }); continue; }
    const pax = m.passengers.filter((p) => p.walker.visible && !p.inIncident && ['WAITING', 'WALKING_TO_PLATFORM', 'REACTING_TO_TRAIN', 'LEAVING_STATION'].includes(p.state)).slice(0, 2);
    // Al menos uno ya se iba: halt() borrará su ruta al devolverlo al andén.
    if (pax[0]) pax[0].recover(3, false);
    const startStates = pax.map((p) => p.state);
    const guard = m.guards.find((q) => q.walker.visible && !q.handlingIncident);
    const a = diag();
    for (const p of pax) p.walker.place({ x: p.walker.x, y: 3 * 16 }, 'up');
    if (guard) guard.walker.place({ x: guard.walker.x, y: 3 * 16 }, 'up');
    step(1);
    const next = [...pax.map((p) => p.walker.y), ...(guard ? [guard.walker.y] : [])].map((y) => Math.round(y));
    const fired = delta(a, diag());
    const resumed = pax.every((p) => p.state === 'LEAVING_STATION' && p.walker.moving);
    const starts = pax.map((p) => ({ x: p.walker.x, y: p.walker.y }));
    const progressed = pax.map(() => false);
    for (let i = 0; i < 60 * 12; i++) {
      step(1);
      pax.forEach((p, j) => {
        if (!p.walker.visible || p.state === 'OFFSTAGE' || Math.hypot(p.walker.x - starts[j].x, p.walker.y - starts[j].y) > 1) progressed[j] = true;
      });
    }
    const paxOk = resumed && pax.every((p, i) => progressed[i] && (!p.walker.visible || p.walker.y >= edge));
    const guardHome = guard ? Math.hypot(guard.walker.x - guard.post.x, guard.walker.y - guard.post.y) < 4 || guard.state !== 'RETURN_TO_POSITION' : true;
    forced.push({ want, train: m.train.state, victims: pax.length + (guard ? 1 : 0), startStates, nextFrameY: next, fired, resumed, progressed, paxOk, guardHome, guardState: guard?.state });
  }

  const pass = natural.cycles >= CYCLES && natural.onTrackAfterPhysics === 0 && natural.diag['invalid-destination'] === 0 && natural.diag.invasion === 0 && natural.diag.transition === 0 && natural.diag.guard === 0
    && natural.boarded > 0 && natural.alighted > 0
    && forced.every((x) => x.skipped || (x.nextFrameY.every((y) => y >= edge) && x.fired.guard === x.victims && x.paxOk && x.guardHome));
  return { pass, edge, natural, forced };
}
