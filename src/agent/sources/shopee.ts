import { createHash } from "node:crypto";
import type { Offer, OfferSource } from "../types.js";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

/** Assinatura exigida pela Shopee Affiliate Open API. */
export function shopeeAuthHeader(appId: string, secret: string, payload: string, timestamp: number): string {
  const signature = createHash("sha256").update(`${appId}${timestamp}${payload}${secret}`).digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

interface ShopeeNode {
  itemId: number | string;
  productName: string;
  price?: string;
  priceMin?: string;
  priceDiscountRate?: number;
  ratingStar?: string;
  sales?: number;
  imageUrl?: string;
  productLink: string;
  offerLink: string;
}

export function mapShopeeNode(n: ShopeeNode, keyword: string): Offer | undefined {
  const price = Number(n.priceMin ?? n.price);
  if (!n.productName || !Number.isFinite(price) || price <= 0 || !n.offerLink) return undefined;
  const offer: Offer = {
    source: "shopee",
    id: String(n.itemId),
    title: n.productName.trim(),
    price,
    url: n.productLink,
    affiliateUrl: n.offerLink,
    keyword,
  };
  if (n.priceDiscountRate && n.priceDiscountRate > 0 && n.priceDiscountRate < 100) {
    offer.originalPrice = Math.round((price / (1 - n.priceDiscountRate / 100)) * 100) / 100;
  }
  const rating = Number(n.ratingStar);
  if (Number.isFinite(rating) && rating > 0) offer.rating = rating;
  if (typeof n.sales === "number") offer.sales = n.sales;
  if (n.imageUrl) offer.imageUrl = n.imageUrl;
  return offer;
}

/** Busca produtos pela API oficial de afiliados da Shopee (links já vêm com o seu ID). */
export class ShopeeSource implements OfferSource {
  readonly id = "shopee" as const;

  constructor(
    private readonly appId: string,
    private readonly secret: string,
  ) {}

  async search(keyword: string, limit: number): Promise<Offer[]> {
    // sortType 2 = mais vendidos
    const query = `{productOfferV2(keyword: ${JSON.stringify(keyword)}, sortType: 2, page: 1, limit: ${limit}) {
      nodes { itemId productName price priceMin priceDiscountRate ratingStar sales imageUrl productLink offerLink }
    }}`;
    const payload = JSON.stringify({ query });
    const timestamp = Math.floor(Date.now() / 1000);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: shopeeAuthHeader(this.appId, this.secret, payload, timestamp),
      },
      body: payload,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json()) as {
      data?: { productOfferV2?: { nodes?: ShopeeNode[] } };
      errors?: { message: string }[];
    };
    if (body.errors?.length) throw new Error(`Shopee: ${body.errors.map((e) => e.message).join("; ")}`);
    if (!res.ok) throw new Error(`Shopee respondeu ${res.status}`);

    return (body.data?.productOfferV2?.nodes ?? [])
      .map((n) => mapShopeeNode(n, keyword))
      .filter((o): o is Offer => o !== undefined);
  }
}
