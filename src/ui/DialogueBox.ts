import type { DialogueSystem } from '../systems/DialogueSystem';

export class DialogueBox {
  private readonly speakerEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly choicesEl: HTMLElement;

  private readonly root: HTMLElement;
  private readonly dialogue: DialogueSystem;

  constructor(root: HTMLElement, dialogue: DialogueSystem) {
    this.root = root;
    this.dialogue = dialogue;
    root.innerHTML = `
      <div class="dialogue__panel">
        <p class="dialogue__speaker"></p>
        <p class="dialogue__text"></p>
        <ol class="dialogue__choices"></ol>
        <p class="dialogue__hint"></p>
      </div>
    `;

    this.speakerEl = this.pick('.dialogue__speaker');
    this.textEl = this.pick('.dialogue__text');
    this.hintEl = this.pick('.dialogue__hint');
    this.choicesEl = this.pick('.dialogue__choices');

    dialogue.on('open', (speaker: string, line: string) => {
      this.speakerEl.textContent = speaker;
      this.setLine(line);
      root.classList.add('is-open');
    });
    dialogue.on('line', (line: string) => this.setLine(line));
    dialogue.on('close', () => root.classList.remove('is-open'));
  }

  private pick(selector: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Diálogo: falta ${selector}`);
    return el;
  }

  private setLine(line: string): void {
    this.textEl.textContent = line;
    const { choices } = this.dialogue;
    this.choicesEl.replaceChildren(
      ...choices.map((label, i) => {
        const item = document.createElement('li');
        item.textContent = `${i + 1}. ${label}`;
        return item;
      }),
    );
    if (choices.length > 0) this.hintEl.textContent = `Elige con 1–${choices.length}`;
    else this.hintEl.textContent = this.dialogue.hasMore ? 'E para seguir' : 'E para cerrar';
  }
}
