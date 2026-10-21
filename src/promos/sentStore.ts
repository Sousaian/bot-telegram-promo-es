/**
 * Guarda as chaves das promoções já publicadas (em memória, com limite).
 * Ao reiniciar o processo o histórico é perdido; para persistir, troque por
 * uma implementação com arquivo, Redis ou banco.
 */
export class SentStore {
  private readonly keys = new Set<string>();

  constructor(private readonly maxSize = 5_000) {}

  has(key: string): boolean {
    return this.keys.has(key);
  }

  add(key: string): void {
    this.keys.delete(key);
    this.keys.add(key);
    while (this.keys.size > this.maxSize) {
      const oldest = this.keys.values().next().value;
      if (oldest === undefined) break;
      this.keys.delete(oldest);
    }
  }

  get size(): number {
    return this.keys.size;
  }
}
