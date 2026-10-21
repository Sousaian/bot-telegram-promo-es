/** Promoção no formato recebido do backend e da API HTTP. */
export interface Promo {
  nome: string;
  preco: number;
  categoria: string;
  url: string;
  imagem?: string;
}

export type ParseResult =
  | { ok: true; promo: Promo }
  | { ok: false; errors: string[] };

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

const isHttpUrl = (v: string): boolean => {
  if (!URL.canParse(v)) return false;
  const { protocol } = new URL(v);
  return protocol === "http:" || protocol === "https:";
};

/** Valida um objeto desconhecido (JSON) e o converte em Promo. */
export function parsePromo(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["a promoção deve ser um objeto"] };
  }
  const data = input as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(data.nome)) errors.push("nome é obrigatório");
  if (!isNonEmptyString(data.categoria)) errors.push("categoria é obrigatória");

  const preco = typeof data.preco === "string" ? Number(data.preco) : data.preco;
  if (typeof preco !== "number" || !Number.isFinite(preco) || preco < 0) {
    errors.push("preco deve ser um número >= 0");
  }

  if (!isNonEmptyString(data.url) || !isHttpUrl(data.url)) {
    errors.push("url deve ser uma URL http(s) válida");
  }

  if (data.imagem !== undefined && data.imagem !== null && data.imagem !== "") {
    if (!isNonEmptyString(data.imagem) || !isHttpUrl(data.imagem)) {
      errors.push("imagem, se informada, deve ser uma URL http(s) válida");
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const promo: Promo = {
    nome: (data.nome as string).trim(),
    categoria: (data.categoria as string).trim(),
    preco: preco as number,
    url: (data.url as string).trim(),
  };
  if (isNonEmptyString(data.imagem)) promo.imagem = data.imagem.trim();
  return { ok: true, promo };
}

/** Chave usada para não publicar a mesma oferta duas vezes (mesmo link + mesmo preço). */
export function promoKey(promo: Promo): string {
  return `${promo.url}|${promo.preco.toFixed(2)}`;
}
