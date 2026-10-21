import type { Promo } from "../domain/promo.js";

const priceFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatPrice(value: number): string {
  // Intl usa espaço não separável (U+00A0) entre "R$" e o valor
  return priceFormatter.format(value).replace(/\u00a0/g, " ");
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Monta a mensagem da promoção em HTML (parse_mode: "HTML"). Cabe no limite de legenda (1024). */
export function formatPromoMessage(promo: Promo): string {
  const headline = promo.chamada ? escapeHtml(truncate(promo.chamada, 80)) : "Promoção encontrada!";

  let priceLine = `💰 <b>${formatPrice(promo.preco)}</b>`;
  if (promo.precoOriginal && promo.precoOriginal > promo.preco) {
    const pct = Math.round((1 - promo.preco / promo.precoOriginal) * 100);
    priceLine = `💰 De <s>${formatPrice(promo.precoOriginal)}</s> por <b>${formatPrice(promo.preco)}</b> (-${pct}%)`;
  }

  return [
    `🔥 <b>${headline}</b>`,
    "",
    `🛍️ <b>${escapeHtml(truncate(promo.nome, 200))}</b>`,
    priceLine,
    promo.loja ? `🏪 Loja: <i>${escapeHtml(promo.loja)}</i>` : `📦 Categoria: <i>${escapeHtml(promo.categoria)}</i>`,
    "",
    `🔗 <a href="${escapeHtml(promo.url)}">Compre aqui</a>`,
  ].join("\n");
}
