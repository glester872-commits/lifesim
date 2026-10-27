import { PALETTE, TILE } from '../config/constants';
import { FACINGS, type Facing } from '../types/game';
import { drawPersonFine } from '../world/HumanArtHD';
import type { HumanColors, Pose } from '../world/HumanArt';
import { drawBench, drawLamp, PLAYER_COLORS } from '../world/TextureFactory';
import { withAppearance } from '../systems/Appearance';
import { buildOf, START_FITNESS } from '../systems/Fitness';
import { NAME_MAX } from '../systems/PlayerIdentity';
import {
  BASE_DRAFT,
  CATEGORIES,
  CATEGORY_LABEL,
  cycle,
  draftAppearance,
  optionColor,
  optionLabel,
  randomDraft,
  readable,
  type CreatorCategory,
  type CreatorDraft,
} from '../systems/CharacterCreator';

/**
 * El creador de personaje (Alpha-04), dentro de la pantalla de inicio (title.ts). La vista previa pinta con el
 * mismo dibujo que el sprite del juego (world/HumanArtHD.drawPersonFine con los colores de
 * TextureFactory.repaintPerson): lo que se ve aquí es lo que se ve en la calle. Las poses (4 direcciones × los
 * fotogramas de andar y de reposo) se pintan sólo al cambiar algo; cada tic de la animación sólo las copia.
 * Al lado, una farola y un banco del juego a la misma escala, sobre suelo claro y oscuro.
 *
 * No guarda nada: devuelve el borrador con `onConfirm` y quien llama decide. Cerrar quita el temporizador y
 * las escuchas.
 */

export interface CreatorHooks {
  onCancel(): void;
  onConfirm(draft: CreatorDraft): void;
}

/** Las direcciones en el orden de la vista previa: de frente, perfil, perfil y de espaldas. */
const ORDER: readonly Facing[] = (['down', 'left', 'right', 'up'] as const).filter((f) => FACINGS.includes(f));
/** Andar como Player (TextureFactory.registerAnimations, 8 fps): 1, 0, 2, 0. Quieto: 0 y, a ratos, 3 (respira). */
const WALK: readonly Pose[] = [1, 0, 2, 0];
const IDLE: readonly Pose[] = [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3];
const FRAME_MS = 125;

/** Lienzo lógico de la escena: cuatro personas de 16 × 24 y la farola (16 × 32) y el banco (16 × 16) de referencia. */
const SCENE_W = 120;
const SCENE_H = 40;
const FLOOR_Y = 34;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function openCreator(host: HTMLElement, initial: CreatorDraft, hooks: CreatorHooks): () => void {
  let draft: CreatorDraft = { ...initial };
  let walking = true;
  let tick = 0;
  let frames = new Map<string, HTMLCanvasElement>();
  const build = buildOf(START_FITNESS);

  const root = document.createElement('div');
  root.className = 'title__panel creator';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'creator-title');
  root.innerHTML = `
    <h2 class="title__heading" id="creator-title">Tu personaje</h2>
    <div class="creator__stage"><canvas class="creator__preview" role="img"></canvas></div>
    <label class="creator__name"><span class="title__label">Nombre</span>
      <input type="text" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" enterkeyhint="done" /></label>
    <div class="creator__rows">${CATEGORIES.map((c) => `
      <div class="creator__row" data-cat="${c}">
        <span class="creator__cat" id="cat-${c}">${CATEGORY_LABEL[c]}</span>
        <button type="button" class="title__button creator__step" data-step="-1" aria-label="${CATEGORY_LABEL[c]}: anterior">‹</button>
        <span class="creator__value" aria-live="polite" aria-labelledby="cat-${c}"><i class="creator__swatch"></i><span></span></span>
        <button type="button" class="title__button creator__step" data-step="1" aria-label="${CATEGORY_LABEL[c]}: siguiente">›</button>
      </div>`).join('')}
    </div>
    <p class="title__warn creator__hint" role="status"></p>
    <div class="title__row">
      <button type="button" class="title__button" data-act="walk" aria-pressed="true">Andando</button>
      <button type="button" class="title__button" data-act="random">Al azar</button>
      <button type="button" class="title__button" data-act="reset">De serie</button>
    </div>
    <nav class="title__menu">
      <button type="button" class="title__button" data-act="confirm">Continuar</button>
      <button type="button" class="title__button" data-act="cancel">Cancelar</button>
    </nav>`;
  host.appendChild(root);

  const preview = root.querySelector<HTMLCanvasElement>('.creator__preview')!;
  const input = root.querySelector<HTMLInputElement>('input')!;
  const hint = root.querySelector<HTMLElement>('.creator__hint')!;
  input.value = draft.name;

  // Lo de referencia no cambia: se pinta una vez.
  const lamp = canvas(TILE, TILE * 2);
  drawLamp(lamp.getContext('2d')!);
  const bench = canvas(TILE, TILE);
  drawBench(bench.getContext('2d')!);

  /** Las poses del borrador de ahora, una vez por cambio (no por fotograma). */
  function bake(): void {
    const colors: HumanColors = { ...withAppearance(PLAYER_COLORS, draftAppearance(draft)), build };
    const next = new Map<string, HTMLCanvasElement>();
    for (const facing of ORDER) {
      for (const pose of new Set([...WALK, ...IDLE])) {
        const c = canvas(16, 24);
        drawPersonFine(c.getContext('2d', { willReadFrequently: true })!, facing, pose, colors);
        next.set(`${facing}-${pose}`, c);
      }
    }
    frames = next;
  }

  /** Escala entera (nearest-neighbor de verdad): cuántos píxeles de pantalla por píxel de arte caben a lo ancho. */
  function fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const room = Math.max(SCENE_W, (preview.parentElement?.clientWidth ?? SCENE_W * 2) * dpr);
    const scale = Math.max(1, Math.floor(room / SCENE_W));
    if (preview.width !== SCENE_W * scale) {
      preview.width = SCENE_W * scale;
      preview.height = SCENE_H * scale;
      preview.style.width = `${(SCENE_W * scale) / dpr}px`;
      preview.style.height = `${(SCENE_H * scale) / dpr}px`;
    }
    paint();
  }

  function paint(): void {
    const ctx = preview.getContext('2d')!;
    const s = preview.width / SCENE_W;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // Suelo claro (acera de día) a la izquierda y oscuro (noche) a la derecha: se ve contra los dos.
    ctx.fillStyle = '#b8b0a2';
    ctx.fillRect(0, 0, SCENE_W / 2, SCENE_H);
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(SCENE_W / 2, 0, SCENE_W / 2, SCENE_H);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < SCENE_W; x += TILE) ctx.fillRect(x, FLOOR_Y, 1, SCENE_H - FLOOR_Y);
    ctx.fillRect(0, FLOOR_Y, SCENE_W, 1);
    const cycleOf = walking ? WALK : IDLE;
    const pose = cycleOf[tick % cycleOf.length];
    ORDER.forEach((facing, i) => {
      const frame = frames.get(`${facing}-${pose}`);
      // Dos sobre el suelo claro, la farola en medio y dos sobre el oscuro, junto al banco.
      const x = [4, 22, 64, 84][i];
      // La sombra en el suelo, bajo los pies.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + 4, FLOOR_Y - 1, 8, 2);
      if (frame) ctx.drawImage(frame, x, FLOOR_Y - 24 + 1);
    });
    ctx.drawImage(lamp, 42, FLOOR_Y - TILE * 2 + 1);
    ctx.drawImage(bench, SCENE_W - TILE - 2, FLOOR_Y - TILE + 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function update(): void {
    for (const cat of CATEGORIES) {
      const row = root.querySelector<HTMLElement>(`[data-cat="${cat}"]`)!;
      const color = optionColor(cat, draft[cat]);
      const sw = row.querySelector<HTMLElement>('.creator__swatch')!;
      sw.hidden = !color;
      if (color) sw.style.background = color;
      row.querySelector<HTMLElement>('.creator__value > span')!.textContent = optionLabel(cat, draft[cat]);
    }
    preview.setAttribute('aria-label', `Vista previa en cuatro direcciones: ${CATEGORIES.map((c) => `${CATEGORY_LABEL[c]} ${optionLabel(c, draft[c])}`).join(', ')}.`);
    hint.textContent = readable(draft) ? '' : 'Con este pelo y esta piel, la cabeza se lee poco a tamaño de juego.';
    bake();
    paint();
  }

  const set = (next: CreatorDraft): void => {
    const changed = CATEGORIES.filter((c) => next[c] !== draft[c]);
    draft = { ...next, name: draft.name };
    update();
    // Lo que acaba de cambiar se marca un momento (animación CSS, sin temporizador): al azar o «de serie», varias filas.
    for (const cat of changed) {
      const row = root.querySelector<HTMLElement>(`[data-cat="${cat}"]`)!;
      row.classList.remove('is-changed');
      void row.offsetWidth;
      row.classList.add('is-changed');
    }
  };

  const onClick = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!el) return;
    const cat = el.closest<HTMLElement>('[data-cat]')?.dataset.cat as CreatorCategory | undefined;
    if (cat && el.dataset.step) return set(cycle(draft, cat, Number(el.dataset.step) as 1 | -1));
    const act = el.dataset.act;
    if (act === 'walk') {
      walking = !walking;
      el.setAttribute('aria-pressed', String(walking));
      el.textContent = walking ? 'Andando' : 'Quieto';
      tick = 0;
      paint();
    } else if (act === 'random') set(randomDraft((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, draft));
    else if (act === 'reset') set(BASE_DRAFT);
    else if (act === 'cancel') hooks.onCancel();
    else if (act === 'confirm') hooks.onConfirm({ ...draft, name: input.value });
  };

  // Teclado: ↑/↓ entre filas, ←/→ cambia la opción de la fila con el foco, Esc cancela. En el nombre, las flechas son del texto.
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Escape') return hooks.onCancel();
    if (e.target === input) {
      if (e.key === 'Enter') root.querySelector<HTMLButtonElement>('[data-act="confirm"]')?.focus();
      return;
    }
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-cat]');
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && row) {
      e.preventDefault();
      set(cycle(draft, row.dataset.cat as CreatorCategory, e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      // De fila en fila (los dos botones de una fila cuentan como uno).
      let i = at;
      do i = (i + step + buttons.length) % buttons.length;
      while (row && buttons[i].closest('[data-cat]') === row);
      buttons[i].focus();
    }
  };

  input.addEventListener('input', () => {
    draft = { ...draft, name: input.value };
  });
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  const timer = window.setInterval(() => {
    tick++;
    paint();
  }, FRAME_MS);
  const resize = new ResizeObserver(fit);
  resize.observe(root);

  update();
  fit();
  input.focus();
  input.select();

  return () => {
    window.clearInterval(timer);
    resize.disconnect();
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
    frames.clear();
    root.remove();
  };
}
