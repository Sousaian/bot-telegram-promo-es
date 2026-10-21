import { promoKey } from "../domain/promo.js";
import type { PromoPublisher } from "../telegram/publisher.js";
import type { SentStore } from "./sentStore.js";
import type { PromoSource } from "./source.js";

export interface RunResult {
  found: number;
  published: number;
  skipped: number;
  failed: number;
}

/**
 * Busca promoções periodicamente e publica apenas as novas.
 * Usa setTimeout encadeado: uma execução nunca começa antes da anterior terminar.
 */
export class PromoPoller {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = true;

  constructor(
    private readonly source: PromoSource,
    private readonly publisher: PromoPublisher,
    private readonly sent: SentStore,
    private readonly intervalMs: number,
  ) {}

  /** Executa um ciclo: busca, filtra as já enviadas e publica o resto. */
  async runOnce(): Promise<RunResult> {
    const promos = await this.source.fetchPromos();
    const result: RunResult = { found: promos.length, published: 0, skipped: 0, failed: 0 };

    for (const promo of promos) {
      const key = promoKey(promo);
      if (this.sent.has(key)) {
        result.skipped++;
        continue;
      }
      try {
        await this.publisher.publish(promo);
        this.sent.add(key);
        result.published++;
      } catch (err) {
        result.failed++;
        console.error(`[poller] falha ao publicar "${promo.nome}":`, err);
      }
    }
    return result;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const r = await this.runOnce();
      console.log(
        `[poller] ${r.found} encontradas, ${r.published} publicadas, ${r.skipped} repetidas, ${r.failed} com erro`,
      );
    } catch (err) {
      console.error("[poller] erro ao buscar promoções:", err instanceof Error ? err.message : err);
    } finally {
      this.running = false;
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), this.intervalMs);
    }
  }
}
