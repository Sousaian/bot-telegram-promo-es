import type { Promo } from "../src/domain/promo.js";
import type { PromoPublisher } from "../src/telegram/publisher.js";

export const samplePromo = (overrides: Partial<Promo> = {}): Promo => ({
  nome: "Fone JBL",
  categoria: "Áudio",
  preco: 199.9,
  url: "https://www.amazon.com.br/dp/abc?tag=x",
  ...overrides,
});

export class FakePublisher implements PromoPublisher {
  published: Promo[] = [];
  failOn = new Set<string>();

  async publish(promo: Promo): Promise<void> {
    if (this.failOn.has(promo.nome)) throw new Error("telegram fora do ar");
    this.published.push(promo);
  }
}
