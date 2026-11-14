import './style.css';
import { version } from '../package.json';
import { PALETTE } from './config/constants';
import { AUDIO_LABEL, AUDIO_LEVELS, loadAudioLevel, saveAudioLevel, type AudioLevel } from './config/audio';
import { QUALITY, setQuality, type QualityLevel } from './config/quality';
import { formatDateShort } from './systems/Calendar';
import { euros } from './systems/Commerce';
import { getLocation } from './systems/LocationSystem';
import { inspectRaw, restore, SAVE_MAX_BYTES, type SaveInfo } from './systems/SaveSystem';
import { activeSlot, gameStorage, placeName, setActiveSlot, SLOT_IDS, slotSave, viewSlot, type SlotId, type SlotView } from './systems/SaveSlots';
import { SAVE_VERSION } from './config/constants';
import type { GameStateData } from './types/game';
import { BASE_DRAFT, newGameState, type CreatorDraft } from './systems/CharacterCreator';
import { cleanName, DEFAULT_NAME } from './systems/PlayerIdentity';
import { LOGO_W, paintLogo, startTitleScene } from './ui/TitleScene';

/**
 * Pantalla de inicio (Alpha-01). Va antes que main.ts: hasta que se elige Continuar o Nueva partida no hay
 * juego, ni autoguardado, ni nada que pueda pisar lo guardado. Sólo lee; lo único que escribe es
 * SaveSystem.startNew (copia y quita lo anterior) y los ajustes del navegador (sonido y calidad).
 * Volver aquí desde la partida es recargar la página (ui/PauseMenu): ninguna escena, escucha ni temporizador sobrevive.
 */

const found = document.querySelector<HTMLElement>('#title');
if (!found) throw new Error('Falta el nodo #title');
const root = found;
// Detrás, la calle de la portada (ui/TitleScene); delante, lo que cambia con cada vista. render() sólo toca `panel`.
root.innerHTML = '<div class="title__scene" aria-hidden="true"></div><div class="title__content"></div>';
const panel = root.querySelector<HTMLElement>('.title__content')!;
const scene = startTitleScene(root.querySelector<HTMLElement>('.title__scene')!);
// Detrás no se llega con Tab ni con el lector de pantalla: el HUD del juego no existe hasta que se entra.
const behind = [document.querySelector<HTMLElement>('#overlay'), document.querySelector<HTMLElement>('#game')];
for (const el of behind) if (el) el.inert = true;

document.documentElement.style.setProperty('--amber', PALETTE.amber);
document.documentElement.style.setProperty('--accent', PALETTE.glassLit);

// Ranuras (systems/SaveSlots): la de trabajo es la última jugada; «Partidas» y «Nueva partida» cambian de ranura.
const { base, persistent, writable } = gameStorage();
let slot: SlotId = activeSlot(base);
let save = slotSave(base, slot);
let info: SaveInfo = save.inspect();
let message = '';
/** Candado contra el doble toque: una acción que escribe no se ejecuta dos veces por la misma pulsación. */
let busy = false;

function useSlot(id: SlotId): void {
  slot = id;
  save = slotSave(base, id);
  info = save.inspect();
}

const SLOT_STATUS: Readonly<Record<SlotView['status'], string>> = { vacia: 'Vacía', guardada: 'Guardada', danada: 'Dañada: no se puede cargar', 'sin-verificar': 'Guardada (sin verificar)' };

/** Una ranura en la lista: lo que hay, sin restaurar la partida entera (resumen guardado aparte). */
function slotLine(v: SlotView): string {
  const s = v.summary;
  const head = `<strong>Ranura ${v.id}${v.id === slot ? ' · en uso' : ''}</strong> · ${SLOT_STATUS[v.status]}`;
  if (!s) return head;
  const saved = s.savedAt ? `Guardada el ${new Date(s.savedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : '';
  return `${head}<br>${esc(s.name || DEFAULT_NAME)} · Día ${s.day} · ${formatDateShort(s.day)} · ${pad(s.hour)}:${pad(s.minute)}<br>${esc(placeName(s.locationId))} · ${euros(s.money)}${saved ? `<br><span class="title__muted">${saved}</span>` : ''}`;
}

const QUALITY_LABEL: Readonly<Record<QualityLevel, string>> = { low: 'baja', medium: 'media', high: 'alta' };
const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pad = (n: number): string => String(n).padStart(2, '0');

/** Lo que se enseña de una partida: cuándo, dónde y con cuánto. Nada de mensajes ni contactos. */
function summary(i: Extract<SaveInfo, { status: 'ok' }>): string {
  const s = restore(i.state);
  const saved = i.savedAt ? `Guardada el ${new Date(i.savedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : '';
  return `<strong>${esc(s.identity?.name ?? DEFAULT_NAME)}</strong><br>Día ${s.day} · ${formatDateShort(s.day)} · ${pad(s.hour)}:${pad(s.minute)}<br>${esc(getLocation(s.locationId).name)} · ${euros(s.money)}${saved ? `<br><span class="title__muted">${saved}</span>` : ''}`;
}

/** La partida tal cual está en el navegador, a un archivo: lo que se lleve el jugador no depende de este almacenamiento. */
function download(raw: string, state: GameStateData | null): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  // El nombre del archivo dice de quién y de qué día es, sólo con letras y números (vale en cualquier sistema).
  const who = state ? `${(state.identity?.name ?? DEFAULT_NAME).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'partida'}-dia${state.day}` : 'danada';
  a.download = `lifesim-${who}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type View = 'main' | 'about' | 'controls' | 'settings' | 'saves' | 'import' | 'creator' | 'confirm' | 'loading';
let view: View = 'main';
let withoutBackup = false;
/** Lo que salió bien (importar, recuperar): se dice una vez, aparte de los avisos. */
let notice = '';
/** El archivo elegido para importar, ya leído y validado; nada se escribe hasta confirmarlo. */
let pending: Extract<SaveInfo, { status: 'ok' }> | null = null;

/** Por qué un archivo o una partida no se puede cargar, en palabras del jugador. */
function unreadableText(reason: 'corrupt' | 'newer' | 'foreign' | 'none'): string {
  if (reason === 'newer') return `Es de una versión más nueva del juego (esta guarda la ${SAVE_VERSION}) y no se sabe leer.`;
  if (reason === 'foreign') return 'No es una partida de LIFE//SIM.';
  if (reason === 'none') return 'Está vacío.';
  return 'Está dañado o incompleto y no se puede cargar.';
}

/** Elegir un archivo de partida: el selector del navegador; lo leído se valida antes de enseñar nada. */
function chooseFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    notice = '';
    if (file.size > SAVE_MAX_BYTES) {
      message = `«${esc(file.name)}» es demasiado grande para ser una partida. No se ha tocado nada.`;
      return render();
    }
    let text = '';
    try {
      text = await file.text();
    } catch {
      message = `No se ha podido leer «${esc(file.name)}». No se ha tocado nada.`;
      return render();
    }
    const found = inspectRaw(text);
    if (found.status !== 'ok') {
      message = `«${esc(file.name)}»: ${unreadableText(found.status === 'none' ? 'none' : found.reason)} No se ha tocado nada.`;
      return render();
    }
    pending = found;
    withoutBackup = false;
    view = 'import';
    render();
  }, { once: true });
  input.click();
}
/** El personaje que se está creando (Alpha-04). Nada de él se guarda hasta «Empezar». */
let draft: CreatorDraft = { ...BASE_DRAFT };
let closeCreator: (() => void) | null = null;

/** El creador (ui/CharacterCreator) se carga al abrirlo: trae el dibujo de la gente, y con él Phaser. */
async function mountCreator(): Promise<void> {
  try {
    const { openCreator } = await import('./ui/CharacterCreator');
    if (view !== 'creator') return;
    panel.innerHTML = '';
    closeCreator = openCreator(panel, draft, {
      onCancel: () => {
        // Cancelar no guarda ni borra nada: vuelve al menú con lo de antes.
        draft = { ...BASE_DRAFT };
        view = 'main';
        render();
      },
      onConfirm: (d) => {
        draft = { ...d, name: cleanName(d.name) };
        view = 'confirm';
        render();
      },
    });
  } catch (error) {
    console.error(error);
    view = 'main';
    message = 'No se ha podido abrir el creador de personaje. No se ha tocado nada.';
    render();
  }
}

const button = (action: string, label: string, extra = ''): string => `<button type="button" class="title__button" data-action="${action}" ${extra}>${label}</button>`;
const back = button('main', 'Volver');

function render(): void {
  root.classList.toggle('is-home', view === 'main');
  // Salir del creador lo cierra entero (temporizador de la vista previa y escuchas).
  closeCreator?.();
  closeCreator = null;
  if (view === 'creator') {
    panel.innerHTML = '<div class="title__panel"><p class="title__save" role="status">Preparando el creador…</p></div>';
    void mountCreator();
    return;
  }
  // El logotipo es un dibujo (ui/TitleScene.paintLogo); el texto sigue ahí para el lector de pantalla.
  const head = `<h1 class="title__logo"><canvas class="title__logo-art" aria-hidden="true"></canvas><span class="title__sr">LIFE//SIM</span></h1>${view === 'main' ? '<p class="title__tagline">Una vida en la ciudad</p>' : ''}`;
  let body = '';
  if (view === 'main') {
    const state =
      (!persistent
        ? '<p class="title__warn" role="alert">Este navegador no deja guardar (modo privado o almacenamiento bloqueado). Puedes jugar, pero al cerrar o recargar la página se pierde la partida.</p>'
        : !writable
          ? '<p class="title__warn" role="alert">El almacenamiento del navegador está lleno o no permite escribir. Puedes continuar o exportar tus partidas, pero no se podrán guardar avances hasta que haya espacio y permiso para guardar.</p>'
          : '')
      + `<p class="title__save title__muted">Ranura ${slot}</p>`
      + (info.status === 'ok'
        ? `<p class="title__save">${summary(info)}</p>`
        : info.status === 'unreadable'
          ? `<p class="title__warn" role="alert">La partida guardada no se puede cargar: ${info.reason === 'newer' ? `es de una versión más nueva del juego (esta guarda la ${SAVE_VERSION})` : info.reason === 'foreign' ? 'no es una partida de LIFE//SIM' : 'está dañada o incompleta'}. No se ha borrado: puedes descargarla antes de decidir.</p>`
          : `<p class="title__save title__muted">No hay ninguna partida en esta ranura.${SLOT_IDS.some((id) => id !== slot && viewSlot(base, id).status !== 'vacia') ? ' Las otras, en «Partidas».' : ''}</p>`);
    // Sin partida que se pueda jugar y con una copia buena: se ofrece volver a ella, con lo que tiene.
    const backup = info.status !== 'ok' ? save.inspectBackup() : null;
    body = `${state}
      ${backup?.status === 'ok' ? `<p class="title__save title__muted">Hay una copia de seguridad: ${summary(backup)}</p>` : ''}
      <nav class="title__menu" aria-label="Menú principal">
        ${button('continue', 'Continuar', info.status === 'ok' ? '' : 'disabled aria-disabled="true"')}
        ${backup?.status === 'ok' ? button('recover', 'Recuperar la copia') : ''}
        ${button('new', 'Nueva partida')}
        ${info.status === 'unreadable' ? button('download', 'Descargar la dañada') : ''}
        ${button('saves', 'Partidas')}
        ${button('controls', 'Controles')}
        ${button('settings', 'Ajustes')}
        ${button('about', 'Créditos')}
      </nav>`;
  } else if (view === 'about') {
    body = `<div class="title__text">
        <p><strong>LifeSim</strong> es un simulador de vida urbana en pixel art: un barrio con horarios, metro, trabajo, estudios,
        cuentas de casa y gente que sigue su día. Está en desarrollo; muchas cosas faltan o cambiarán.</p>
        <p>Creado por <strong>Lester</strong>.</p>
        <p>Versión ${esc(version)} · <strong>Alpha</strong>: puede haber fallos, y las partidas se guardan sólo en este navegador.</p>
        <p class="title__muted">Hecho con Phaser 3, TypeScript y Vite. El arte del mundo se dibuja por código.</p>
      </div>
      <nav class="title__menu">${back}</nav>`;
  } else if (view === 'controls') {
    body = `<dl class="title__keys">
        <dt>W A S D / flechas</dt><dd>Caminar</dd>
        <dt>E</dt><dd>Hablar, entrar, usar</dd>
        <dt>Espacio / Intro</dt><dd>Avanzar diálogo</dd>
        <dt>1–9</dt><dd>Elegir opción</dd>
        <dt>Esc / Q</dt><dd>Volver o cerrar; sin nada abierto, menú de pausa</dd>
        <dt>M · P · I · N</dt><dd>Mapa · Móvil · Bolsa · Sonido</dd>
      </dl>
      <p class="title__text title__muted">En pantalla táctil: joystick abajo a la izquierda y botón de acción a la derecha; las opciones se tocan.</p>
      <nav class="title__menu">${back}</nav>`;
  } else if (view === 'settings') {
    const audio = loadAudioLevel();
    body = `<div class="title__settings">
        <p class="title__label" id="set-audio">Sonido de ambiente</p>
        <div class="title__row" role="group" aria-labelledby="set-audio">${AUDIO_LEVELS.map((l) => button(`audio:${l}`, AUDIO_LABEL[l], `aria-pressed="${l === audio}"`)).join('')}</div>
        <p class="title__label" id="set-quality">Calidad gráfica</p>
        <div class="title__row" role="group" aria-labelledby="set-quality">${QUALITY_LEVELS.map((l) => button(`quality:${l}`, QUALITY_LABEL[l], `aria-pressed="${l === QUALITY.level}"`)).join('')}</div>
        <p class="title__muted">Se recuerdan en este navegador, no en la partida.</p>
      </div>
      <nav class="title__menu">${back}</nav>`;
  } else if (view === 'saves') {
    // Tres ranuras independientes: cada una con su partida, su copia de seguridad y su archivo exportado.
    const slots = SLOT_IDS.map((id) => {
      const v = viewSlot(base, id);
      return `<li class="title__slot">
          <p class="title__save">${slotLine(v)}</p>
          <div class="title__row">
            ${id !== slot ? button(`use:${id}`, 'Usar esta', `aria-label="Usar la ranura ${id}"`) : ''}
            ${v.status === 'guardada' || v.status === 'sin-verificar' || v.status === 'danada' ? button(`export:${id}`, v.status === 'danada' ? 'Descargar' : 'Exportar', `aria-label="${v.status === 'danada' ? 'Descargar' : 'Exportar'} la ranura ${id}"`) : ''}
            ${button(`import:${id}`, 'Importar aquí', `aria-label="Importar una partida en la ranura ${id}"`)}
          </div>
        </li>`;
    }).join('');
    body = `<ul class="title__slots" aria-label="Ranuras de partida">${slots}</ul>
      <p class="title__text title__muted">Cada ranura guarda su partida y su copia en este navegador. Exportar baja un archivo JSON; importar
      lo valida antes de tocar nada y guarda una copia de lo que sustituye en esa ranura.</p>
      <nav class="title__menu">${back}</nav>`;
  } else if (view === 'import' && pending) {
    const replaces = info.status === 'none' ? '' : `<p>Sustituye ${info.status === 'ok' ? `tu partida (${summary(info)})` : 'la partida guardada que no se puede leer'}; se guardará una copia en este navegador.</p>`;
    body = `<div class="title__text" role="alertdialog" aria-labelledby="import-text">
        <div id="import-text"><p>Importar esta partida:</p><p class="title__save">${summary(pending)}</p>${replaces}</div>
        ${withoutBackup ? '<p class="title__warn" role="alert">No hay espacio para la copia de seguridad. Exporta antes la tuya, o importa sin copia.</p>' : ''}
      </div>
      <nav class="title__menu">
        ${button('import-yes', withoutBackup ? 'Importar sin copia' : 'Importar')}
        ${info.status === 'ok' ? button('export', 'Exportar la mía antes') : ''}
        ${button('saves', 'Cancelar')}
      </nav>`;
  } else if (view === 'confirm') {
    // En qué ranura: las ocupadas dicen qué tienen; elegir una ocupada lleva al aviso de sustitución de abajo.
    const chooser = `<p class="title__label" id="new-slot">Ranura</p><div class="title__row" role="group" aria-labelledby="new-slot">${SLOT_IDS.map((id) => {
      const v = viewSlot(base, id);
      return button(`newslot:${id}`, `${id} · ${v.status === 'vacia' ? 'vacía' : v.summary?.name ? esc(v.summary.name) : 'ocupada'}`, `aria-pressed="${id === slot}"`);
    }).join('')}</div>`;
    const who = `${chooser}<p>Empezar como <strong>${esc(draft.name)}</strong> en el portal de casa, con lo de una partida nueva, en la ranura ${slot}.</p>`;
    if (info.status === 'none') {
      body = `<div class="title__text" role="alertdialog" aria-labelledby="confirm-text"><div id="confirm-text">${who}</div></div>
        <nav class="title__menu">
          ${button('confirm-new', 'Empezar')}
          ${button('cancel', 'Volver al personaje')}
        </nav>`;
    } else {
      const lost = info.status === 'ok' ? `tu partida (${summary(info)})` : 'la partida guardada que no se puede leer';
      body = `<div class="title__text" role="alertdialog" aria-labelledby="confirm-text">
          <div id="confirm-text">${who}<p>Sustituye ${lost}: dinero, objetos, ropa, contactos, trabajo, estudios, sucesos vividos y la hora del mundo.
          Los ajustes de sonido y calidad se mantienen.</p></div>
          <p class="title__muted">Se guardará una copia de la partida anterior en este navegador; descárgala si quieres conservarla fuera.</p>
          ${withoutBackup ? '<p class="title__warn" role="alert">No hay espacio para la copia de seguridad. Descárgala antes, o empieza sin copia.</p>' : ''}
        </div>
        <nav class="title__menu">
          ${button('cancel', 'Volver al personaje')}
          ${button('download', 'Descargar copia')}
          ${button('confirm-new', withoutBackup ? 'Empezar sin copia' : 'Empezar de cero')}
        </nav>`;
    }
  } else {
    body = `<p class="title__save" role="status" aria-live="polite">${message || 'Cargando la ciudad…'}</p>`;
  }
  const said = view === 'loading' ? '' : `${notice ? `<p class="title__ok" role="status">${notice}</p>` : ''}${message ? `<p class="title__warn" role="alert">${message}</p>` : ''}`;
  panel.innerHTML = `<div class="title__panel">${head}${body}${said}</div>`;
  const logo = panel.querySelector<HTMLCanvasElement>('.title__logo-art');
  // Escala entera que quepa en el panel (de 3 a 7 veces el dibujo) y, en pantallas bajas (un móvil apaisado), en el alto.
  if (logo) paintLogo(logo, Math.max(3, Math.min(7, Math.floor(Math.min(window.innerWidth - 72, 400) / LOGO_W), Math.floor(window.innerHeight / 110))));
  // El foco, en el primer botón que se puede usar: con el teclado se empieza a elegir sin ratón.
  panel.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
}

let booting = false;
async function boot(): Promise<void> {
  if (booting) return;
  booting = true;
  // main.ts abre esta elección de sesión aunque no quepa la preferencia para la próxima recarga.
  setActiveSlot(base, slot);
  view = 'loading';
  message = '';
  render();
  try {
    const { game } = await import('./main');
    // Se quita cuando la calle ya está montada (BootScene → World), no antes: así no se ve un lienzo negro.
    const hide = (): void => {
      root.hidden = true;
      panel.innerHTML = '';
      scene.stop();
      for (const el of behind) if (el) el.inert = false;
    };
    const timer = setTimeout(hide, 20_000);
    game.events.once('lifesim:world-ready', () => {
      clearTimeout(timer);
      hide();
    });
  } catch (error) {
    console.error(error);
    booting = false;
    view = 'main';
    info = save.inspect();
    message = `No se ha podido arrancar el juego (${esc(error instanceof Error ? error.message : String(error))}). Lo guardado no se ha tocado; recarga la página para reintentar.`;
    render();
  }
}

panel.addEventListener('click', (e) => {
  const action = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
  if (!action) return;
  // Lo que escribe no corre dos veces por un doble toque (se suelta al terminar: todo aquí es síncrono salvo boot).
  const writes = action === 'confirm-new' || action === 'import-yes' || action === 'recover';
  if (writes && busy) return;
  busy = writes;
  try {
    handle(action);
  } finally {
    busy = false;
  }
});

function handle(action: string): void {
  message = '';
  notice = '';
  const [verb, n] = action.split(':');
  const id = (SLOT_IDS as readonly number[]).includes(Number(n)) ? (Number(n) as SlotId) : null;
  if (action === 'continue' && info.status === 'ok') return void boot();
  if (verb === 'use' && id) {
    useSlot(id);
    setActiveSlot(base, id);
    notice = `Ranura ${id} en uso.`;
    view = 'main';
  } else if (verb === 'export' && id) {
    const found = slotSave(base, id).inspect();
    if (found.status !== 'none') download(found.raw, found.status === 'ok' ? found.state : null);
    return;
  } else if (verb === 'import' && id) {
    // Importar en una ranura concreta: lo que tenga se copia antes a su copia de seguridad (adopt).
    useSlot(id);
    chooseFile();
    return;
  } else if (verb === 'newslot' && id) {
    useSlot(id);
    withoutBackup = false;
    view = 'confirm';
  } else if (action === 'new') {
    // Primero el personaje; lo guardado no se toca hasta confirmar al final. Se propone la primera ranura vacía.
    withoutBackup = false;
    draft = { ...BASE_DRAFT };
    if (info.status !== 'none') {
      const empty = SLOT_IDS.find((s) => viewSlot(base, s).status === 'vacia');
      if (empty) useSlot(empty);
    }
    view = 'creator';
  } else if (action === 'confirm-new') {
    // Con algo guardado (aunque no se lea): copia y quita antes. Si no hay sitio para la copia, se pregunta otra vez.
    if (info.status !== 'none' && !save.startNew(withoutBackup)) {
      if (withoutBackup) message = 'No se ha podido quitar la partida anterior del almacenamiento del navegador. No se ha empezado nada.';
      withoutBackup = true;
    } else if (save.save(newGameState(draft))) {
      // La partida nueva ya está escrita con su personaje: main.ts la carga como cualquier otra.
      return void boot();
    } else {
      info = save.inspect();
      message = `No se ha podido guardar el personaje: el almacenamiento del navegador está lleno o bloqueado.${info.status === 'none' ? ' La partida anterior está en la copia de seguridad.' : ''} No se ha empezado nada.`;
    }
  } else if (action === 'cancel') {
    // Desde la confirmación, atrás es el personaje, tal como estaba.
    view = 'creator';
  } else if ((action === 'download' || action === 'export') && info.status !== 'none') {
    download(info.raw, info.status === 'ok' ? info.state : null);
    return;
  } else if (action === 'import') {
    chooseFile();
    return;
  } else if (action === 'import-yes' && pending) {
    if (save.adopt(pending.raw, withoutBackup)) {
      info = save.inspect();
      pending = null;
      notice = 'Partida importada. Ya puedes continuarla.';
      view = 'main';
    } else {
      // Si lo de antes sigue ahí, faltó sitio para su copia: se pregunta. Si no, faltó para la importada.
      info = save.inspect();
      if (!withoutBackup && info.status !== 'none') withoutBackup = true;
      else {
        message = `No se ha podido guardar la partida importada: el almacenamiento del navegador está lleno o bloqueado.${save.inspectBackup().status === 'ok' ? ' La anterior está en la copia de seguridad.' : ''}`;
        view = 'main';
      }
    }
  } else if (action === 'recover') {
    if (save.restoreBackup()) {
      info = save.inspect();
      notice = 'Copia recuperada. La partida que no se leía queda apartada, no borrada.';
    } else message = 'No se ha podido recuperar la copia. No se ha tocado nada.';
  } else if (action === 'saves') {
    pending = null;
    view = 'saves';
  } else if (action.startsWith('audio:')) {
    saveAudioLevel(action.slice(6) as AudioLevel);
  } else if (action.startsWith('quality:')) {
    setQuality(action.slice(8) as QualityLevel);
  } else if (action === 'main') {
    view = 'main';
  } else if (action === 'about' || action === 'controls' || action === 'settings') {
    view = action;
  }
  render();
}

// Teclado: flechas para moverse entre botones (además de Tab) y Esc para volver al menú.
panel.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && view !== 'main' && view !== 'loading') {
    view = 'main';
    message = '';
    render();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
  if (!buttons.length) return;
  e.preventDefault();
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
  buttons[(at + step + buttons.length) % buttons.length].focus();
});

render();
