import { extractJson, type LlmClient } from "../llm/client.js";
import { discountPercent, offerKey, SOURCE_LABEL, type Offer } from "./types.js";

export interface Pick {
  offer: Offer;
  headline?: string;
}

export interface CurateInput {
  candidates: Offer[];
  maxPosts: number;
  instructions?: string | undefined;
}

export interface Curator {
  curate(input: CurateInput): Promise<Pick[]>;
}

/** Pontuação simples: desconto pesa mais, avaliação e popularidade desempatam. */
export function scoreOffer(o: Offer): number {
  const popularity = Math.log10(1 + (o.reviews ?? 0) + (o.sales ?? 0));
  const rating = o.rating ? (o.rating - 3.5) * 10 : 0;
  return discountPercent(o) * 1.5 + rating + popularity * 4;
}

export class HeuristicCurator implements Curator {
  async curate({ candidates, maxPosts }: CurateInput): Promise<Pick[]> {
    return [...candidates]
      .sort((a, b) => scoreOffer(b) - scoreOffer(a))
      .slice(0, maxPosts)
      .map((offer) => ({ offer }));
  }
}

const SYSTEM_PROMPT = `Você é um curador de promoções para um grupo de ofertas no Telegram (Brasil).
Recebe uma lista de produtos encontrados nas lojas e escolhe os que valem a pena publicar.

Critérios:
- Prefira desconto real e relevante, boa avaliação e produtos de marca/qualidade conhecida.
- Evite itens duplicados ou muito parecidos (escolha só o melhor de cada tipo).
- Evite acessórios irrelevantes quando a busca era por outro produto.
- Se nada valer a pena, devolva uma lista vazia.

Para cada escolha, escreva uma "headline": frase curta e chamativa em PT-BR (até 60 caracteres),
sem inventar informações que não estejam nos dados. Pode usar no máximo 1 emoji.

Responda APENAS com JSON no formato:
{"picks":[{"id":"<id exato da lista>","headline":"..."}]}`;

/** Usa um LLM para escolher e escrever as chamadas; cai na heurística se falhar. */
export class LlmCurator implements Curator {
  constructor(
    private readonly llm: LlmClient,
    private readonly fallback: Curator = new HeuristicCurator(),
    private readonly maxCandidates = 25,
  ) {}

  buildPrompt({ candidates, maxPosts, instructions }: CurateInput): string {
    const items = candidates.slice(0, this.maxCandidates).map((o) => ({
      id: offerKey(o),
      loja: SOURCE_LABEL[o.source],
      busca: o.keyword,
      titulo: o.title.slice(0, 140),
      preco: o.price,
      ...(o.originalPrice ? { preco_original: o.originalPrice, desconto_pct: discountPercent(o) } : {}),
      ...(o.rating ? { nota: o.rating } : {}),
      ...(o.reviews ? { avaliacoes: o.reviews } : {}),
      ...(o.sales ? { vendidos: o.sales } : {}),
    }));
    return [
      `Escolha no máximo ${maxPosts} ofertas.`,
      instructions ? `Instruções do dono do grupo: ${instructions}` : "",
      "Produtos:",
      JSON.stringify(items),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async curate(input: CurateInput): Promise<Pick[]> {
    if (input.candidates.length === 0) return [];
    const pool = [...input.candidates].sort((a, b) => scoreOffer(b) - scoreOffer(a));
    const ordered = { ...input, candidates: pool };
    try {
      const raw = await this.llm.complete({ system: SYSTEM_PROMPT, user: this.buildPrompt(ordered) });
      const parsed = extractJson(raw) as { picks?: { id?: unknown; headline?: unknown }[] };
      const byKey = new Map(pool.map((o) => [offerKey(o), o]));
      const seen = new Set<string>();
      const picks: Pick[] = [];
      for (const p of parsed.picks ?? []) {
        if (typeof p.id !== "string" || seen.has(p.id)) continue;
        const offer = byKey.get(p.id);
        if (!offer) continue;
        seen.add(p.id);
        const pick: Pick = { offer };
        if (typeof p.headline === "string" && p.headline.trim()) pick.headline = p.headline.trim().slice(0, 80);
        picks.push(pick);
        if (picks.length >= input.maxPosts) break;
      }
      return picks;
    } catch (err) {
      console.warn(`[curator] ${this.llm.label} falhou, usando heurística:`, err instanceof Error ? err.message : err);
      return this.fallback.curate(ordered);
    }
  }
}
