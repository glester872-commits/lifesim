/**
 * Pellizco con dos dedos sobre el lienzo: un paso de zoom por gesto (>1,25 acerca, <0,8 aleja) y la referencia se
 * rearma tras cada paso. Avisa con el evento `lifesim:zoom` (detail 1 | -1); WorldScene decide si procede.
 */
export function mountPinchZoom(stage: HTMLElement): void {
  stage.style.touchAction = 'none';
  const touches = new Map<number, { x: number; y: number }>();
  let ref = 0;
  const gap = (): number => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    ref = touches.size === 2 ? gap() : 0;
  });
  stage.addEventListener('pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX;
    t.y = e.clientY;
    if (touches.size !== 2 || ref < 1) return;
    const ratio = gap() / ref;
    if (ratio > 1.25 || ratio < 0.8) {
      window.dispatchEvent(new CustomEvent('lifesim:zoom', { detail: ratio > 1 ? 1 : -1 }));
      ref = gap();
    }
  });
  const up = (e: PointerEvent): void => {
    touches.delete(e.pointerId);
    ref = 0;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
}
