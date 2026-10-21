import type { Promo } from "../domain/promo.js";
import type { SentStore } from "../promos/sentStore.js";
import type { PromoPublisher } from "../telegram/publisher.js";
import { buildAffiliateUrl, type AffiliateConfig } from "./affiliate.js";
import type { JobConfig } from "./config.js";
import type { Curator, Pick } from "./curator.js";
import { discountPercent, offerKey, offerSentKey, SOURCE_LABEL, type Offer, type OfferSource, type SourceId } from "./types.js";

/** Escolha publicada (ou selecionada, em simulação) com o link de afiliado usado. */
export interface PublishedPick extends Pick {
  affiliateUrl: string;
}

export interface JobReport {
  job: string;
  startedAt: Date;
  durationMs: number;
  found: number;
  candidates: number;
  published: PublishedPick[];
  failed: number;
  errors: string[];
  dryRun: boolean;
}

export interface AgentDeps {
  sources: Partial<Record<SourceId, OfferSource>>;
  affiliates: AffiliateConfig;
  publisher: PromoPublisher;
  sent: SentStore;
  /** Curador com LLM (quando configurado) e heurístico. */
  curators: { llm?: Curator | undefined; heuristic: Curator };
  delayBetweenPostsMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Aplica os filtros do job. Exportado para teste. */
export function passesFilters(o: Offer, job: JobConfig): boolean {
  if (discountPercent(o) < job.minDiscount) return false;
  if (job.minPrice !== undefined && o.price < job.minPrice) return false;
  if (job.maxPrice !== undefined && o.price > job.maxPrice) return false;
  if (job.minRating !== undefined && o.rating !== undefined && o.rating < job.minRating) return false;
  if (job.exclude.length) {
    const title = normalize(o.title);
    if (job.exclude.some((w) => title.includes(normalize(w)))) return false;
  }
  return true;
}

export function offerToPromo(pick: Pick, affiliateUrl: string): Promo {
  const { offer } = pick;
  const promo: Promo = {
    nome: offer.title,
    preco: offer.price,
    categoria: offer.keyword,
    loja: SOURCE_LABEL[offer.source],
    url: affiliateUrl,
  };
  if (offer.originalPrice) promo.precoOriginal = offer.originalPrice;
  if (offer.imageUrl) promo.imagem = offer.imageUrl;
  if (pick.headline) promo.chamada = pick.headline;
  return promo;
}

/** Agente: busca nas lojas, filtra, deduplica, escolhe (LLM ou heurística) e publica. */
export class PromoAgent {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: AgentDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async collect(job: JobConfig, errors: string[]): Promise<Offer[]> {
    const offers: Offer[] = [];
    for (const sourceId of job.sources) {
      const source = this.deps.sources[sourceId];
      if (!source) {
        errors.push(`${sourceId}: fonte não configurada`);
        continue;
      }
      for (const keyword of job.keywords) {
        try {
          offers.push(...(await source.search(keyword, job.perKeyword)));
        } catch (err) {
          errors.push(`${sourceId} "${keyword}": ${(err as Error).message}`);
        }
      }
    }
    return offers;
  }

  async runJob(job: JobConfig, options: { dryRun?: boolean } = {}): Promise<JobReport> {
    const startedAt = new Date();
    const errors: string[] = [];
    const dryRun = options.dryRun ?? false;

    const found = await this.collect(job, errors);

    const unique = new Map<string, Offer>();
    for (const o of found) {
      if (!passesFilters(o, job)) continue;
      if (!buildAffiliateUrl(o, this.deps.affiliates)) continue;
      if (this.deps.sent.has(offerSentKey(o))) continue;
      const key = offerKey(o);
      const prev = unique.get(key);
      if (!prev || o.price < prev.price) unique.set(key, o);
    }
    const candidates = [...unique.values()];

    const curator = job.useLlm && this.deps.curators.llm ? this.deps.curators.llm : this.deps.curators.heuristic;
    const picks = await curator.curate({ candidates, maxPosts: job.maxPosts, instructions: job.instructions });

    const published: PublishedPick[] = [];
    let failed = 0;
    for (const pick of picks) {
      const affiliateUrl = buildAffiliateUrl(pick.offer, this.deps.affiliates);
      if (!affiliateUrl) continue;
      if (dryRun) {
        published.push({ ...pick, affiliateUrl });
        continue;
      }
      if (published.length > 0 && this.deps.delayBetweenPostsMs) await this.sleep(this.deps.delayBetweenPostsMs);
      try {
        await this.deps.publisher.publish(offerToPromo(pick, affiliateUrl), { chatId: job.chatId });
        this.deps.sent.add(offerSentKey(pick.offer));
        published.push({ ...pick, affiliateUrl });
      } catch (err) {
        failed++;
        errors.push(`publicar "${pick.offer.title.slice(0, 40)}": ${(err as Error).message}`);
      }
    }

    return {
      job: job.name,
      startedAt,
      durationMs: Date.now() - startedAt.getTime(),
      found: found.length,
      candidates: candidates.length,
      published,
      failed,
      errors,
      dryRun,
    };
  }
}

export function summarizeReport(r: JobReport): string {
  const verb = r.dryRun ? "selecionadas (simulação)" : "publicadas";
  const lines = [
    `[job ${r.job}] ${r.found} encontradas, ${r.candidates} candidatas, ${r.published.length} ${verb}` +
      (r.failed ? `, ${r.failed} falharam` : "") +
      ` em ${(r.durationMs / 1000).toFixed(1)}s`,
  ];
  for (const e of r.errors) lines.push(`  ! ${e}`);
  return lines.join("\n");
}
