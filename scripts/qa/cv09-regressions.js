// Regresiones de CV-09 (CV08-AUDIT.md): AUD-001, AUD-003 y AUD-008. Se ejecutan en el navegador, no en `npm run check`:
// Menu y el móvil son DOM y GameState importa Phaser. Uso: `npm run dev`, abrir el juego en un perfil/contexto aislado
// (nunca con la partida de verdad: esto paga una factura y reescribe el guardado) y evaluar esta función (DevTools o
// chrome-devtools evaluate_script con sourcePath). Devuelve { ok, checks }; cada check dice qué se esperaba y qué hubo.
async () => {
  const L = window.lifesim;
  const S = L.services;
  const s = S.state;
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tapAt = (x, y) => document.elementFromPoint(x, y)?.click();
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const items = (root) => [...document.querySelectorAll(root === '.menu' ? 'li.menu__item' : `${root} li`)].filter((l) => l.offsetParent);
  if (S.menu.isOpen) S.menu.close();
  S.clock.setPaused(true);

  // AUD-001 · menú: el segundo toque de un doble toque no elige en la pantalla que acaba de abrirse.
  const picked = [];
  const openB = () => S.menu.open('QA B', '', [{ label: 'b0' }, { label: 'b1' }, { label: 'b2' }], (i) => picked.push(`B${i}`), () => {});
  S.menu.open('QA A', '', [{ label: 'a0' }, { label: 'a1' }, { label: 'a2' }], (i) => { picked.push(`A${i}`); openB(); }, () => {});
  await sleep(400);
  const [ax, ay] = center(items('.menu')[2]);
  tapAt(ax, ay);
  await sleep(80);
  tapAt(ax, ay);
  check('AUD-001 menú: doble toque elige una vez', picked.join() === 'A2', { elegidas: picked.join() });
  await sleep(400);
  tapAt(ax, ay);
  check('AUD-001 menú: pasado el bloqueo se elige', picked.join() === 'A2,B2', { elegidas: picked.join() });
  // La misma pantalla rehecha (cantidad, nota) no bloquea: «Más» varias veces seguidas cuenta todas.
  let more = 0;
  const openQty = () => S.menu.open('QA C', `${more}`, [{ label: 'Más' }], () => { more++; openQty(); }, () => {});
  openQty();
  await sleep(400);
  const [cx, cy] = center(items('.menu')[0]);
  for (let i = 0; i < 3; i++) { tapAt(cx, cy); await sleep(80); }
  check('AUD-001 menú: rehacer la misma pantalla no bloquea', more === 3, { pulsaciones: more });
  S.menu.close();

  // AUD-001 · móvil: dos toques sobre una factura no la pagan sin confirmar.
  const bill = s.snapshot.household.obligations.find((o) => o.paid === undefined);
  if (bill) {
    const money0 = s.money;
    const paidCount = () => s.snapshot.household.obligations.filter((o) => o.paid !== undefined).length;
    const paid0 = paidCount();
    document.querySelector('button[aria-label^="Abrir el móvil"]').click();
    await sleep(400);
    [...document.querySelectorAll('.phone__device button')].find((b) => /Cuentas/.test(b.innerText)).click();
    await sleep(400);
    const row = items('.phone__screen').find((l) => /Alquiler|Luz/.test(l.innerText));
    const [px, py] = center(row);
    tapAt(px, py);
    await sleep(80);
    // El peor caso de un doble toque: el segundo cae justo en «Confirmar pago», que acaba de aparecer.
    const confirm = items('.phone__screen').find((l) => /Confirmar pago/.test(l.innerText));
    if (confirm) tapAt(...center(confirm));
    const title = document.querySelector('.phone__title')?.innerText;
    check('AUD-001 móvil: el segundo toque no confirma el pago', s.money === money0 && paidCount() === paid0 && /Pagar/.test(title ?? ''), { dinero: [money0, s.money], pantalla: title });
    await sleep(400);
    items('.phone__screen').find((l) => /Confirmar pago/.test(l.innerText))?.click();
    await sleep(200);
    check('AUD-001 móvil: confirmar a propósito paga una vez', s.money < money0 && paidCount() === paid0 + 1, { dinero: [money0, s.money], pagadas: paidCount() - paid0 });
    document.querySelector('button[aria-label^="Cerrar el móvil"]').click();
  } else check('AUD-001 móvil: hace falta una factura sin pagar', false, { obligaciones: s.snapshot.household.obligations.length });

  // AUD-003 · un objeto que ya no existe no entra al cargar (la bolsa se abriría con error y para siempre).
  const raw = localStorage.getItem('lifesim.save');
  const file = JSON.parse(raw);
  file.state.inventory = { ...file.state.inventory, 'tarta-retirada': 1 };
  localStorage.setItem('lifesim.save', JSON.stringify(file));
  const loaded = S.save.load();
  localStorage.setItem('lifesim.save', raw);
  check('AUD-003 id desconocido fuera al cargar', loaded && !('tarta-retirada' in loaded.inventory), { inventario: loaded?.inventory });

  // AUD-008 · al ocultarse la pestaña se guarda.
  const before = JSON.parse(localStorage.getItem('lifesim.save')).savedAt;
  await sleep(20);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  delete document.visibilityState;
  const after = JSON.parse(localStorage.getItem('lifesim.save')).savedAt;
  check('AUD-008 guardado al ocultarse', after > before, { antes: before, despues: after });

  S.clock.setPaused(false);
  return { ok: checks.every((c) => c.pass), checks };
}
