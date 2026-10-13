import { createInitialState, parseSave, serialize, type SaveSystem } from '../systems/SaveSystem';
import { hasLocation, getLocation } from '../systems/LocationSystem';
import { formatClock } from '../systems/TimeSystem';
import type { GameState } from '../state/GameState';
import type { GameStateData } from '../types/game';
import type { Menu } from './Menu';

/** Tras sustituir la partida se recarga; esto evita volver a la pantalla de inicio. */
const SKIP_TITLE = 'lifesim.skipTitle';
/** Una partida pesa unos KB; un fichero así de grande no es una partida. */
const MAX_IMPORT = 2_000_000;
const LOCAL_ONLY = 'Se guarda sola en este navegador y este dispositivo. Para llevarla a otro, exporta la partida (G) y luego impórtala allí.';

const summary = (s: Pick<GameStateData, 'day' | 'hour' | 'minute' | 'money' | 'locationId'>): string =>
  `${formatClock(s.day, s.hour, s.minute)} · €${Math.round(s.money)}${hasLocation(s.locationId) ? ` · ${getLocation(s.locationId).name}` : ''}`;

/** true (y lo consume) si esta carga viene de sustituir la partida: se entra directamente a jugar. */
export function consumeSkipTitle(): boolean {
  try {
    const skip = window.sessionStorage.getItem(SKIP_TITLE) === '1';
    window.sessionStorage.removeItem(SKIP_TITLE);
    return skip;
  } catch {
    return false;
  }
}

const reloadIntoGame = (): void => {
  try {
    window.sessionStorage.setItem(SKIP_TITLE, '1');
  } catch {
    // Sin sessionStorage se vuelve a la pantalla de inicio, con la partida nueva para continuar.
  }
  window.location.reload();
};

type Item = { label: string; detail?: string; run: () => void };

/**
 * Inicio y menú de partida (G o su botón), sobre el mismo ui/Menu del juego.
 * Nueva, importar y recuperar sustituyen lo guardado (SaveSystem.replace aparta
 * la anterior como copia) y recargan: así nada de la partida de antes queda en
 * memoria (perfiles, enfriamientos, sucesos). Cada aviso dice lo que pasó de verdad.
 */
export class GameMenu {
  private readonly file: HTMLInputElement;
  private readonly menu: Menu;
  private readonly save: SaveSystem;
  private readonly state: GameState;
  /** Guarda ahora como el autoguardado (WorldScene.persist); false si no se pudo. */
  private readonly saveNow: () => boolean;

  constructor(menu: Menu, save: SaveSystem, state: GameState, saveNow: () => boolean) {
    this.menu = menu;
    this.save = save;
    this.state = state;
    this.saveNow = saveNow;
    this.file = document.createElement('input');
    this.file.type = 'file';
    this.file.accept = '.json,application/json';
    this.file.hidden = true;
    document.body.append(this.file);
  }

  /** Pantalla de inicio: nada se guarda hasta elegir. `loaded`: había una partida legible. */
  title(loaded: boolean, unreadable: boolean, note = ''): void {
    this.save.locked = true;
    const again = (n = ''): void => this.title(loaded, unreadable, n);
    const play = (): void => {
      this.save.locked = false;
      this.menu.close();
    };
    const backup = this.save.backup();
    const items: Item[] = [];
    if (loaded) items.push({ label: 'Continuar partida', detail: summary(this.state), run: play });
    items.push({ label: 'Nueva partida', run: () => (loaded ? this.confirmNew(() => again()) : play()) });
    items.push({ label: 'Importar partida', detail: 'archivo .json', run: () => this.importFile(() => again(), again) });
    if (backup) items.push({ label: 'Recuperar copia anterior', detail: summary(backup), run: () => this.confirmRestore(backup, () => again()) });
    const warn = unreadable && !loaded ? 'La partida guardada no se pudo leer: se ha apartado una copia sin borrarla. ' : '';
    // Esc es «seguir»: con partida, la de siempre; sin ella, la nueva que ya está cargada.
    this.menu.open('LIFE//SIM', `${warn}${LOCAL_ONLY}`, items, (i) => items[i].run(), play, note);
  }

  /** Menú de partida durante el juego. */
  pause(note = '', selected = 0): void {
    const back = (n = '', sel = 0): void => this.pause(n, sel);
    const items: Item[] = [
      { label: 'Volver al juego', run: () => this.menu.close() },
      {
        label: 'Guardar ahora',
        run: () => back(this.saveNow() ? `Partida guardada · ${summary(this.state)}` : 'No se pudo guardar: el navegador no deja escribir (modo privado o almacenamiento lleno). Exporta la partida para no perderla.', 1),
      },
      { label: 'Exportar partida', detail: 'archivo .json', run: () => back(this.exportFile(), 2) },
      { label: 'Importar partida', detail: 'archivo .json', run: () => this.importFile(() => back('', 3), (n) => back(n, 3)) },
      { label: 'Nueva partida', run: () => this.confirmNew(() => back('', 4)) },
    ];
    this.menu.open('Partida', LOCAL_ONLY, items, (i) => items[i].run(), undefined, note, selected);
  }

  private confirm(title: string, text: string, yes: string, onYes: () => void, onNo: () => void): void {
    this.menu.open(title, text, [{ label: yes }, { label: 'No, volver' }], (i) => (i === 0 ? onYes() : onNo()), onNo, '', 1);
  }

  private notice(title: string, text: string, back: () => void): void {
    this.menu.open(title, text, [{ label: 'Volver' }], back, back);
  }

  private confirmNew(back: () => void): void {
    this.confirm('Nueva partida', `Empezar de cero. La partida actual (${summary(this.state)}) se aparta como copia anterior: se puede recuperar desde el inicio.`, 'Sí, empezar de cero', () => {
      if (this.save.replace(createInitialState())) reloadIntoGame();
      else this.notice('Nueva partida', 'No se pudo empezar: el navegador no deja apartar la partida actual. No se ha borrado nada.', back);
    }, back);
  }

  private confirmRestore(backup: GameStateData, back: () => void): void {
    this.confirm('Recuperar copia', `Volver a la copia anterior (${summary(backup)}). La partida actual pasa a ser la copia: no se pierde ninguna.`, 'Sí, recuperarla', () => {
      if (this.save.restoreBackup()) reloadIntoGame();
      else this.notice('Recuperar copia', 'No se pudo recuperar: el navegador no deja escribir. No se ha cambiado nada.', back);
    }, back);
  }

  private exportFile(): string {
    const name = `lifesim-dia-${this.state.day}.json`;
    const url = URL.createObjectURL(new Blob([serialize(this.state.snapshot)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return `Descarga iniciada: ${name}`;
  }

  /** Elige un archivo, lo valida y pide confirmación antes de sustituir nada. `fail` vuelve con el motivo. */
  private importFile(back: () => void, fail: (note: string) => void): void {
    this.file.value = '';
    this.file.onchange = async () => {
      const f = this.file.files?.[0];
      if (!f) return;
      const raw = f.size > MAX_IMPORT ? '' : await f.text().catch(() => '');
      const next = raw ? parseSave(raw) : null;
      if (!next) {
        fail(`«${f.name}» no es una partida de LIFE//SIM que se pueda leer (o es de una versión más nueva). No se ha cambiado nada.`);
        return;
      }
      this.confirm('Importar partida', `Sustituir la partida actual (${summary(this.state)}) por la de «${f.name}» (${summary(next)}). La actual se aparta como copia anterior.`, 'Sí, importarla', () => {
        if (this.save.replace(next)) reloadIntoGame();
        else fail('No se pudo importar: el navegador no deja escribir. La partida actual sigue intacta.');
      }, back);
    };
    this.file.click();
  }
}
