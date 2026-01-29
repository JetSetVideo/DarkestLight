import { on } from "../../ui/dom";

export type PanZoomState = {
  x: number;
  y: number;
  zoom: number;
};

export class PanZoom {
  readonly state: PanZoomState = { x: 0, y: 0, zoom: 2.5 };
  #cleanup: Array<() => void> = [];

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { onInteraction?: () => void } = {},
  ) {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    this.#cleanup.push(
      on(canvas, "pointerdown", (ev) => {
        dragging = true;
        lastX = ev.clientX;
        lastY = ev.clientY;
        (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
        opts.onInteraction?.();
      }),
    );

    this.#cleanup.push(
      on(canvas, "pointermove", (ev) => {
        if (!dragging) return;
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        this.state.x += dx;
        this.state.y += dy;
      }),
    );

    const end = () => (dragging = false);
    this.#cleanup.push(on(canvas, "pointerup", () => end()));
    this.#cleanup.push(on(canvas, "pointercancel", () => end()));

    this.#cleanup.push(
      on(canvas, "wheel", (ev: WheelEvent) => {
        ev.preventDefault();
        const delta = Math.sign(ev.deltaY);
        const z = this.state.zoom * (delta > 0 ? 0.92 : 1.08);
        this.state.zoom = clamp(z, 1.2, 8.0);
        opts.onInteraction?.();
      }, { passive: false }),
    );
  }

  destroy() {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

