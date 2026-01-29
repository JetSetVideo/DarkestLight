export interface Screen {
  mount(): void | Promise<void>;
  destroy(): void;
}

