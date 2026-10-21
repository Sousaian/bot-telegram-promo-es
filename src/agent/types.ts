export type SourceId = "amazon" | "shopee" | "mercadolivre";

export const SOURCE_LABEL: Record<SourceId, string> = {
  amazon: "Amazon",
  shopee: "Shopee",
  mercadolivre: "Mercado Livre",
};

/** Oferta normalizada, independente da loja de origem. */
export interface Offer {
  source: SourceId;
  /** ID do produto na loja (ASIN, itemId, MLB...). */
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  rating?: number;
  reviews?: number;
  sales?: number;
  imageUrl?: string;
  /** URL canônica do produto (sem afiliado). */
  url: string;
  /** Link de afiliado já pronto, quando a própria API da loja devolve (Shopee). */
  affiliateUrl?: string;
  /** Palavra-chave que encontrou a oferta. */
  keyword: string;
}

export interface OfferSource {
  readonly id: SourceId;
  search(keyword: string, limit: number): Promise<Offer[]>;
}

export const offerKey = (o: Pick<Offer, "source" | "id">): string => `${o.source}:${o.id}`;

/** Chave de deduplicação: mesmo produto e mesmo preço não é publicado de novo. */
export const offerSentKey = (o: Offer): string => `${offerKey(o)}|${o.price.toFixed(2)}`;

export function discountPercent(o: Pick<Offer, "price" | "originalPrice">): number {
  if (!o.originalPrice || o.originalPrice <= o.price) return 0;
  return Math.round((1 - o.price / o.originalPrice) * 100);
}
