import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface SentStoreOptions {
  /** Depois desse tempo a chave expira e a oferta pode ser publicada de novo. */
  ttlMs?: number;
  /** Se informado, o histórico é salvo em JSON e sobrevive a reinícios. */
  filePath?: string;
}

/** Registro das ofertas já publicadas (chave -> timestamp), com limite de tamanho. */
export class SentStore {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number | undefined;
  private readonly filePath: string | undefined;

  constructor(
    private readonly maxSize = 5_000,
    options: SentStoreOptions = {},
  ) {
    this.ttlMs = options.ttlMs && options.ttlMs > 0 ? options.ttlMs : undefined;
    this.filePath = options.filePath;
    this.load();
  }

  has(key: string, now = Date.now()): boolean {
    const at = this.entries.get(key);
    if (at === undefined) return false;
    if (this.ttlMs !== undefined && now - at > this.ttlMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  add(key: string, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, now);
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.save();
  }

  get size(): number {
    return this.entries.size;
  }

  private load(): void {
    if (!this.filePath) return;
    try {
      const data = JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, number>;
      for (const [k, v] of Object.entries(data).sort((a, b) => a[1] - b[1])) {
        if (typeof v === "number") this.entries.set(k, v);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`[sent] não consegui ler ${this.filePath}, começando vazio:`, (err as Error).message);
      }
    }
  }

  private save(): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries)));
    renameSync(tmp, this.filePath);
  }
}
