import { parsePromo, type Promo } from "../domain/promo.js";

export interface PromoSource {
  fetchPromos(): Promise<Promo[]>;
}

/** Busca promoções em um backend HTTP que devolve um array JSON. */
export class HttpPromoSource implements PromoSource {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async fetchPromos(): Promise<Promo[]> {
    const response = await fetch(this.url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) {
      throw new Error(`backend respondeu ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      throw new Error("backend deveria responder um array de promoções");
    }

    const promos: Promo[] = [];
    body.forEach((item, index) => {
      const result = parsePromo(item);
      if (result.ok) promos.push(result.promo);
      else console.warn(`[source] promoção #${index} ignorada: ${result.errors.join("; ")}`);
    });
    return promos;
  }
}
