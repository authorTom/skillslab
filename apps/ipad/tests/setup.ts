// Node 26 defines its own `localStorage` global, gated behind the
// --localstorage-file flag, which resolves to undefined without it. That
// getter shadows the one jsdom would otherwise install, so tests that touch
// web storage see `undefined`. Install a spec-shaped in-memory Storage over
// the top for both globalThis and window.
class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.#entries.get(String(key)) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#entries.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.#entries.delete(String(key));
  }

  clear(): void {
    this.#entries.clear();
  }

  [name: string]: unknown;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const storage = new MemoryStorage();
  for (const target of [globalThis, globalThis.window]) {
    if (!target) continue;
    Object.defineProperty(target, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}
