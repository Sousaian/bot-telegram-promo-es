import { parse } from "node-html-parser";
import { parseBrl } from "../money.js";
import type { Offer, OfferSource } from "../types.js";

const BASE = "https://www.amazon.com.br";
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "accept-language": "pt-BR,pt;q=0.9",
  accept: "text/html,application/xhtml+xml",
};

export class CaptchaError extends Error {}

/** Extrai as ofertas do HTML da página de busca da Amazon. Ignora patrocinados. */
export function parseAmazonSearch(html: string, keyword: string): Offer[] {
  if (/validateCaptcha|captcha/i.test(html) && !html.includes("s-search-result")) {
    throw new CaptchaError("Amazon pediu captcha (muitas requisições ou IP bloqueado)");
  }
  const root = parse(html);
  const offers: Offer[] = [];

  for (const el of root.querySelectorAll('div[data-component-type="s-search-result"]')) {
    const asin = el.getAttribute("data-asin");
    if (!asin) continue;
    if (el.querySelector(".puis-sponsored-label-text") || /Patrocinad/.test(el.text)) continue;

    const h2 = el.querySelector("h2");
    const title = (h2?.getAttribute("aria-label") ?? h2?.text ?? "").trim();
    const price = parseBrl(el.querySelector(".a-price:not(.a-text-price) .a-offscreen")?.text);
    if (!title || price === undefined) continue;

    const originalPrice = parseBrl(el.querySelector('.a-text-price[data-a-strike="true"] .a-offscreen')?.text);
    const ratingText = el.querySelector(".a-icon-alt")?.text;
    const rating = ratingText ? parseBrl(ratingText.split(" ")[0]) : undefined;
    const reviewsLabel = el
      .querySelectorAll("[aria-label]")
      .map((n) => n.getAttribute("aria-label") ?? "")
      .find((l) => /^[\d.]+ (classifica|avalia)/.test(l));
    const reviews = reviewsLabel ? Number(reviewsLabel.split(" ")[0]!.replace(/\./g, "")) : undefined;

    const offer: Offer = { source: "amazon", id: asin, title, price, url: `${BASE}/dp/${asin}`, keyword };
    if (originalPrice && originalPrice > price) offer.originalPrice = originalPrice;
    if (rating !== undefined) offer.rating = rating;
    if (reviews !== undefined && Number.isFinite(reviews)) offer.reviews = reviews;
    const img = el.querySelector("img.s-image")?.getAttribute("src");
    if (img) offer.imageUrl = img;
    offers.push(offer);
  }
  return offers;
}

/**
 * Busca na página pública de resultados da Amazon.
 * Atenção: o Acordo Operacional de Associados da Amazon restringe a coleta
 * automatizada de dados do site. Use com moderação ou troque pela PA-API.
 */
export class AmazonSource implements OfferSource {
  readonly id = "amazon" as const;
  private lastRequest = 0;

  constructor(
    private readonly minIntervalMs = 3_000,
    private readonly maxAttempts = 3,
  ) {}

  private async throttle(): Promise<void> {
    const wait = this.lastRequest + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequest = Date.now();
  }

  async search(keyword: string, limit: number): Promise<Offer[]> {
    const url = `${BASE}/s?k=${encodeURIComponent(keyword)}`;
    let lastError: Error | undefined;

    // A Amazon devolve 503 / captcha de forma intermitente: tenta de novo com backoff.
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      await this.throttle();
      try {
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
        if (res.status === 503 || res.status === 429) throw new CaptchaError(`Amazon respondeu ${res.status}`);
        if (!res.ok) throw new Error(`Amazon respondeu ${res.status}`);
        return parseAmazonSearch(await res.text(), keyword).slice(0, limit);
      } catch (err) {
        lastError = err as Error;
        if (!(err instanceof CaptchaError) || attempt === this.maxAttempts) break;
        await new Promise((r) => setTimeout(r, 2_000 * 2 ** (attempt - 1)));
      }
    }
    throw lastError ?? new Error("Amazon: falha desconhecida");
  }
}
