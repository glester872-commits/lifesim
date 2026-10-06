import type { GameState } from './state/GameState';
import type { TimeSystem } from './systems/TimeSystem';
import type { DialogueSystem } from './systems/DialogueSystem';
import type { SaveSystem } from './systems/SaveSystem';
import type { TargetHint } from './ui/TargetHint';
import type { MetroDebug } from './ui/MetroDebug';
import type { Announcer } from './ui/Announcer';
import type { PlaceBanner } from './ui/PlaceBanner';
import type { MetroEventManager } from './systems/MetroEventManager';
import type { Menu } from './ui/Menu';
import type { MapScreen } from './ui/MapScreen';
import type { PlayerInput } from './systems/PlayerInput';
import type { PhoneScreen } from './ui/Phone';

/** Sistemas compartidos; se inyectan en las Scenes por constructor. */
export interface Services {
  state: GameState;
  clock: TimeSystem;
  dialogue: DialogueSystem;
  save: SaveSystem;
  hint: TargetHint;
  /** Null si METRO_CONFIG.debug está apagado. */
  metroDebug: MetroDebug | null;
  announcer: Announcer;
  place: PlaceBanner;
  metroEvents: MetroEventManager;
  /** Menú de opciones: compras, destinos, actividades y bolsa. */
  menu: Menu;
  /** Mapa del barrio (tecla M o su botón): abierto, el mundo se para como con un menú. */
  map: MapScreen;
  /** Joystick y botones táctiles (ui/MobileControls): el bucle los lee junto al teclado. */
  input: PlayerInput;
  /** El móvil (tecla P o su botón): contactos y mensajes. Abierto, el jugador se para y el mundo sigue. */
  phone: PhoneScreen;
}
