// Regresiones de CV-01 (QA.md): BUG-001 y BUG-002. Se ejecutan en el navegador, no en `npm run check`: GameState
// importa Phaser y no carga en Node. Uso: `npm run dev`, abrir el juego en un perfil/contexto aislado (nunca con la
// partida de verdad: esto la cambia) y evaluar esta función (DevTools o chrome-devtools evaluate_script con sourcePath).
// Devuelve { ok, checks }; cada check dice qué se esperaba y qué hubo.
async () => {
  const L = window.lifesim;
  const S = L.services;
  const s = S.state;
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
  window.__t = performance.now() + 5000;
  const step = (n) => { for (let i = 0; i < n; i++) L.game.step((window.__t += 16), 16); };
  L.game.loop.sleep();
  while (S.dialogue.isOpen) { if (S.dialogue.choices.length) S.dialogue.choose(S.dialogue.choices.length - 1); else S.dialogue.advance(); step(2); }
  if (S.menu.isOpen) S.menu.close();

  // BUG-001: un reloj sin número no se aplica (antes: se guardaba y la partida entera se apartaba como ilegible).
  const clock0 = [s.day, s.hour, s.minute];
  s.setClock(undefined, 10, 0);
  L.date.set();
  check('BUG-001 reloj intacto tras setClock(undefined) y date.set()', [s.day, s.hour, s.minute].every(Number.isFinite) && s.day === clock0[0], { antes: clock0, despues: [s.day, s.hour, s.minute] });
  window.dispatchEvent(new Event('beforeunload'));
  const saved1 = JSON.parse(localStorage.getItem('lifesim.save')).state;
  check('BUG-001 el guardado lleva un reloj legible', Number.isInteger(saved1.day) && Number.isInteger(saved1.hour), { day: saved1.day, hour: saved1.hour });

  // BUG-002: probarse una prenda y cerrar la pestaña no la regala (antes: se guardaba puesta sin pagarla).
  // A las 11:00 (de hoy o de mañana) la tienda está abierta.
  const now = s.hour * 60 + s.minute;
  S.clock.advanceMinutes(now < 660 ? 660 - now : 1440 - now + 660);
  let W = L.game.scene.getScene('World');
  if (s.locationId !== 'district') W.teleport('district', { tx: 6, ty: 16 }, 'up');
  step(30);
  W = L.game.scene.getScene('World');
  W.travel(W.interactables.find((x) => x.portal?.id === 'fashion-door').portal);
  for (let i = 0; i < 200 && s.locationId !== 'fashion'; i++) step(1);
  step(40);
  W = L.game.scene.getScene('World');
  W.interact(W.interactables.find((x) => x.kind === 'rack'));
  step(2);
  const items = () => [...document.querySelectorAll('li.menu__item')];
  const before = JSON.stringify(s.appearanceOf('player'));
  const money = s.money;
  items()[items().findIndex((e) => !/tuya|Cerrar/.test(e.innerText))].click();
  items()[0].click(); // PROBAR
  const trying = JSON.stringify(s.appearanceOf('player'));
  check('BUG-002 la prueba se ve puesta', trying !== before, { trying });
  window.dispatchEvent(new Event('beforeunload'));
  const saved2 = JSON.stringify(JSON.parse(localStorage.getItem('lifesim.save')).state.appearance.player);
  check('BUG-002 lo guardado es el outfit de antes', saved2 === before, { guardado: saved2, antes: before });
  items()[1].click(); // VOLVER A PONER OUTFIT ANTERIOR
  check('BUG-002 volver deja lo de antes y sin prueba', JSON.stringify(s.appearanceOf('player')) === before && s.fitting === null, {});
  items()[0].click(); // PROBAR otra vez
  items()[0].click(); // COMPRAR (si llega el dinero)
  if (s.money < money) {
    W.persist();
    const saved3 = JSON.parse(localStorage.getItem('lifesim.save')).state;
    check('BUG-002 comprada sí se guarda puesta', JSON.stringify(saved3.appearance.player) === JSON.stringify(s.appearanceOf('player')) && s.fitting === null, { dinero: [money, s.money] });
  }
  S.menu.close();
  return { ok: checks.every((c) => c.pass), checks };
}
