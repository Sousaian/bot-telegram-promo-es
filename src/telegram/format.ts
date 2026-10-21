import type { Promo } from "../domain/promo.js";

const priceFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatPrice(value: number): string {
  // Intl usa espaço não separável (U+00A0) entre "R$" e o valor
  return priceFormatter.format(value).replace(/\u00a0/g, " ");
}

/** Monta a mensagem da promoção em HTML (parse_mode: "HTML"). */
export function formatPromoMessage(promo: Promo): string {
  return [
    "🔥 <b>Promoção encontrada!</b>",
    "",
    `🛍️ <b>${escapeHtml(promo.nome)}</b>`,
    `💰 <b>${formatPrice(promo.preco)}</b>`,
    `📦 Categoria: <i>${escapeHtml(promo.categoria)}</i>`,
    "",
    `🔗 <a href="${escapeHtml(promo.url)}">Compre aqui</a>`,
  ].join("\n");
}
