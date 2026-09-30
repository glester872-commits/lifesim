// La capa de input táctil (systems/PlayerInput.ts): la misma que lee WorldScene junto al teclado.
import assert from 'node:assert/strict';
import { PlayerInput } from '../src/systems/PlayerInput.ts';

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

// Stick: reposo, 360°, intensidad progresiva y tope de largo 1.
{
  const input = new PlayerInput();
  input.setStick(0.1, 0.05);
  assert.deepEqual(input.stick, { x: 0, y: 0 }, 'el temblor del pulgar mueve al jugador');
  input.setStick(0.4, 0);
  assert.ok(near(input.stick.x, 0.4), 'sin intensidad progresiva');
  input.setStick(3, 4);
  assert.ok(near(Math.hypot(input.stick.x, input.stick.y), 1), 'el stick pasa de 1');
  for (let a = 0; a < 360; a += 15) {
    const r = (a * Math.PI) / 180;
    input.setStick(Math.cos(r), Math.sin(r));
    assert.ok(near(Math.atan2(input.stick.y, input.stick.x), Math.atan2(Math.sin(r), Math.cos(r))), `se pierde la dirección a ${a}°`);
  }
  input.setStick(0, 0);
  assert.deepEqual(input.stick, { x: 0, y: 0 }, 'al soltar no vuelve al centro');
}

// Flechas virtuales (menús, mirar sentado): diagonales incluidas, y se sueltan al volver.
{
  const input = new PlayerInput();
  input.setStick(0.8, -0.8);
  assert.ok(input.isHeld('up') && input.isHeld('right') && !input.isHeld('down') && !input.isHeld('left'), 'la diagonal no marca arriba y derecha');
  assert.ok(input.consume('up'), 'empujar arriba no cuenta como pulsación');
  assert.ok(!input.consume('up'), 'una pulsación se lee dos veces');
  input.setStick(0.8, -0.8);
  assert.ok(!input.consume('up'), 'mantener el stick repite la pulsación');
  input.setStick(0, 0);
  assert.ok(!input.isHeld('up') && !input.isHeld('right'), 'al soltar sigue marcando una flecha');
}

// Pulsaciones: se gastan al leerlas y no se acumulan para más tarde.
{
  const input = new PlayerInput();
  input.press('interact');
  input.beginFrame();
  assert.ok(input.consume('interact'), 'el frame siguiente no ve el toque');
  input.release('interact');
  input.press('interact');
  input.beginFrame();
  input.beginFrame();
  assert.ok(!input.consume('interact'), 'un toque sin leer se queda guardado');
}

// Multitoque: andar con un pulgar y pulsar la acción con el otro; ninguno cancela al otro.
{
  const input = new PlayerInput();
  input.setStick(0, -1);
  input.press('interact');
  input.beginFrame();
  assert.ok(input.stick.y < 0 && input.consume('interact'), 'la acción cancela el stick (o al revés)');
  input.release('interact');
  assert.ok(input.stick.y < 0 && input.isHeld('up'), 'soltar la acción suelta el stick');
  input.releaseAll();
  assert.ok(input.stick.y === 0 && !input.isHeld('up'), 'al perder el foco alguien sigue andando');
}

// Contexto del botón: sólo avisa cuando cambia.
{
  const input = new PlayerInput();
  const seen: (string | null)[] = [];
  input.onContext((c) => seen.push(c.action));
  input.setContext({ action: 'Hablar', back: false, busy: false });
  input.setContext({ action: 'Hablar', back: false, busy: false });
  input.setContext({ action: 'Entrar', back: false, busy: false });
  assert.deepEqual(seen, [null, 'Hablar', 'Entrar'], 'el botón se repinta sin cambiar');
}

console.log('check-input: stick 360° con zona muerta e intensidad, flechas, pulsaciones sin acumular, multitoque y contexto, OK');
