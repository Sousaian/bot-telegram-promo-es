import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePromo, promoKey } from "../src/domain/promo.js";
import { escapeHtml, formatPrice, formatPromoMessage } from "../src/telegram/format.js";
import { samplePromo } from "./helpers.js";

describe("parsePromo", () => {
  it("aceita uma promoção válida e normaliza campos", () => {
    const r = parsePromo({ nome: "  Fone ", categoria: "Áudio", preco: "199.9", url: "https://a.com/x", imagem: "" });
    assert.deepEqual(r, { ok: true, promo: { nome: "Fone", categoria: "Áudio", preco: 199.9, url: "https://a.com/x" } });
  });

  it("rejeita campos inválidos listando os erros", () => {
    const r = parsePromo({ nome: "", preco: -1, url: "javascript:alert(1)", imagem: "x" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.errors.length, 5);
  });

  it("rejeita o que não é objeto", () => {
    assert.equal(parsePromo(null).ok, false);
    assert.equal(parsePromo([]).ok, false);
  });

  it("gera a mesma chave para mesmo link e preço", () => {
    assert.equal(promoKey(samplePromo()), promoKey(samplePromo({ nome: "outro nome" })));
    assert.notEqual(promoKey(samplePromo()), promoKey(samplePromo({ preco: 150 })));
  });
});

describe("formatação", () => {
  it("formata preço em reais", () => {
    assert.equal(formatPrice(1299.9), "R$ 1.299,90");
  });

  it("escapa HTML do nome e da categoria", () => {
    assert.equal(escapeHtml(`<b>"a" & b</b>`), "&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;");
    const msg = formatPromoMessage(samplePromo({ nome: "Kit *2* <Top>", categoria: "a_b" }));
    assert.match(msg, /Kit \*2\* &lt;Top&gt;/);
    assert.match(msg, /<i>a_b<\/i>/);
    assert.match(msg, /R\$ 199,90/);
    assert.match(msg, /href="https:\/\/www.amazon.com.br\/dp\/abc\?tag=x"/);
  });
});
