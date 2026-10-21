import type { Offer, OfferSource } from "../types.js";

const API = "https://api.mercadolibre.com";

/**
 * EXPERIMENTAL: busca pela API oficial do Mercado Livre (OAuth client_credentials).
 * Desde 2025 o ML restringiu o endpoint de busca: dependendo da aplicação,
 * ele pode responder 403 mesmo com token válido.
 */
export class MercadoLivreSource implements OfferSource {
  readonly id = "mercadolivre" as const;
  private token: { value: string; expiresAt: number } | undefined;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Mercado Livre OAuth respondeu ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  async search(keyword: string, limit: number): Promise<Offer[]> {
    const url = `${API}/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${await this.accessToken()}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Mercado Livre respondeu ${res.status} (veja docs/agente.md)`);
    const body = (await res.json()) as {
      results?: { id: string; title: string; price: number; original_price?: number | null; thumbnail?: string; permalink: string }[];
    };
    return (body.results ?? []).map((r) => {
      const offer: Offer = { source: "mercadolivre", id: r.id, title: r.title, price: r.price, url: r.permalink, keyword };
      if (r.original_price && r.original_price > r.price) offer.originalPrice = r.original_price;
      if (r.thumbnail) offer.imageUrl = r.thumbnail.replace(/^http:/, "https:");
      return offer;
    });
  }
}
