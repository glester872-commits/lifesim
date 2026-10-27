import './style.css';
import { version } from '../package.json';
import { PALETTE } from './config/constants';
import { AUDIO_LABEL, AUDIO_LEVELS, loadAudioLevel, saveAudioLevel, type AudioLevel } from './config/audio';
import { QUALITY, setQuality, type QualityLevel } from './config/quality';
import { formatDateShort } from './systems/Calendar';
import { euros } from './systems/Commerce';
import { getLocation } from './systems/LocationSystem';
import { inspectRaw, restore, SAVE_MAX_BYTES, SaveSystem, type SaveInfo } from './systems/SaveSystem';
import { SAVE_VERSION } from './config/constants';
import type { GameStateData } from './types/game';
import { BASE_DRAFT, newGameState, type CreatorDraft } from './systems/CharacterCreator';
import { cleanName, DEFAULT_NAME } from './systems/PlayerIdentity';

/**
 * Pantalla de inicio (Alpha-01). Va antes que main.ts: hasta que se elige Continuar o Nueva partida no hay
 * juego, ni autoguardado, ni nada que pueda pisar lo guardado. Sólo lee; lo único que escribe es
 * SaveSystem.startNew (copia y quita lo anterior) y los ajustes del navegador (sonido y calidad).
 * Volver aquí desde la partida es recargar la página (ui/PauseMenu): ninguna escena, escucha ni temporizador sobrevive.
 */

const root = document.querySelector<HTMLElement>('#title');
if (!root) throw new Error('Falta el nodo #title');
const panel = root;
// Detrás no se llega con Tab ni con el lector de pantalla: el HUD del juego no existe hasta que se entra.
const behind = [document.querySelector<HTMLElement>('#overlay'), document.querySelector<HTMLElement>('#game')];
for (const el of behind) if (el) el.inert = true;

document.documentElement.style.setProperty('--amber', PALETTE.amber);
document.documentElement.style.setProperty('--accent', PALETTE.glassLit);

const save = new SaveSystem();
let info: SaveInfo = save.inspect();
let message = '';

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
  // Salir del creador lo cierra entero (temporizador de la vista previa y escuchas).
  closeCreator?.();
  closeCreator = null;
  if (view === 'creator') {
    panel.innerHTML = '<div class="title__panel"><p class="title__save" role="status">Preparando el creador…</p></div>';
    void mountCreator();
    return;
  }
  const head = `<h1 class="title__logo">LIFE<span>//</span>SIM</h1>`;
  let body = '';
  if (view === 'main') {
    const state =
      info.status === 'ok'
        ? `<p class="title__save">${summary(info)}</p>`
        : info.status === 'unreadable'
          ? `<p class="title__warn" role="alert">La partida guardada no se puede cargar: ${info.reason === 'newer' ? `es de una versión más nueva del juego (esta guarda la ${SAVE_VERSION})` : info.reason === 'foreign' ? 'no es una partida de LIFE//SIM' : 'está dañada o incompleta'}. No se ha borrado: puedes descargarla antes de decidir.</p>`
          : `<p class="title__save title__muted">No hay ninguna partida guardada en este navegador.</p>`;
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
        ${button('about', 'Acerca de')}
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
    body = `<div class="title__text">
        <p>Las partidas viven en este navegador. Exportar baja un archivo JSON que se puede guardar donde quieras e importar
        aquí o en otro navegador; importar valida el archivo antes de tocar nada y guarda una copia de lo que sustituye.</p>
      </div>
      <nav class="title__menu">
        ${info.status === 'ok' ? button('export', 'Exportar partida') : ''}
        ${button('import', 'Importar partida')}
        ${back}
      </nav>`;
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
    const who = `<p>Empezar como <strong>${esc(draft.name)}</strong> en el portal de casa, con lo de una partida nueva.</p>`;
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
  // El foco, en el primer botón que se puede usar: con el teclado se empieza a elegir sin ratón.
  panel.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
}

async function boot(): Promise<void> {
  view = 'loading';
  message = '';
  render();
  try {
    const { game } = await import('./main');
    // Se quita cuando la calle ya está montada (BootScene → World), no antes: así no se ve un lienzo negro.
    const hide = (): void => {
      panel.hidden = true;
      panel.innerHTML = '';
      for (const el of behind) if (el) el.inert = false;
    };
    const timer = setTimeout(hide, 20_000);
    game.events.once('lifesim:world-ready', () => {
      clearTimeout(timer);
      hide();
    });
  } catch (error) {
    console.error(error);
    view = 'main';
    info = save.inspect();
    message = `No se ha podido arrancar el juego (${esc(error instanceof Error ? error.message : String(error))}). Lo guardado no se ha tocado; recarga la página para reintentar.`;
    render();
  }
}

panel.addEventListener('click', (e) => {
  const action = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
  if (!action) return;
  message = '';
  notice = '';
  if (action === 'continue' && info.status === 'ok') return void boot();
  if (action === 'new') {
    // Primero el personaje; lo guardado no se toca hasta confirmar al final.
    withoutBackup = false;
    draft = { ...BASE_DRAFT };
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
});

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
