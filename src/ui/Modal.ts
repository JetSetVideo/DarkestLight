import { el, on } from "./dom";

export class Modal {
  #backdrop: HTMLDivElement;
  #modal: HTMLDivElement;
  #cleanup: Array<() => void> = [];

  constructor(opts: { title: string; content: HTMLElement; onClose?: () => void }) {
    this.#backdrop = el("div", { className: "dl-modal-backdrop dl-fade-in" });
    this.#modal = el("div", { className: "dl-modal dl-pop" });

    const header = el("div", { className: "dl-modal-header" });
    const h = el("h2", { className: "dl-modal-title", text: opts.title });

    const closeBtn = el("button", { className: "dl-icon-btn" });
    closeBtn.innerHTML =
      `<svg class="dl-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>`;

    header.append(h, closeBtn);
    this.#modal.append(header, opts.content);
    this.#backdrop.append(this.#modal);

    const close = () => {
      this.destroy();
      opts.onClose?.();
    };
    this.#cleanup.push(on(closeBtn, "click", () => close()));
    this.#cleanup.push(
      on(this.#backdrop, "click", (ev) => {
        if (ev.target === this.#backdrop) close();
      }),
    );
    this.#cleanup.push(
      on(window, "keydown", (ev) => {
        if (ev.key === "Escape") close();
      }),
    );
  }

  mount(parent: HTMLElement) {
    parent.append(this.#backdrop);
  }

  destroy() {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    this.#backdrop.remove();
  }
}

