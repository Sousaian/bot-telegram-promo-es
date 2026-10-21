import type { Offer } from "./types.js";

export interface AffiliateConfig {
  amazon?: { tag: string } | undefined;
  mercadolivre?: { params: Record<string, string> } | undefined;
  shopee?: { enabled?: boolean } | undefined;
}

function withParams(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * Monta o link de afiliado da oferta. Retorna undefined quando não há
 * configuração de afiliado para a loja (a oferta não deve ser publicada).
 */
export function buildAffiliateUrl(offer: Offer, cfg: AffiliateConfig): string | undefined {
  switch (offer.source) {
    case "amazon":
      return cfg.amazon ? withParams(offer.url, { tag: cfg.amazon.tag }) : undefined;
    case "mercadolivre":
      return cfg.mercadolivre ? withParams(offer.url, cfg.mercadolivre.params) : undefined;
    case "shopee":
      // A API de afiliados da Shopee já devolve o offerLink com o seu ID.
      return offer.affiliateUrl;
  }
}
