import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseAmazonSearch, CaptchaError } from "../src/agent/sources/amazon.js";
import { mapShopeeNode, shopeeAuthHeader, ShopeeSource } from "../src/agent/sources/shopee.js";
import { parseBrl } from "../src/agent/money.js";
import { buildAffiliateUrl } from "../src/agent/affiliate.js";
import { offer } from "./agent-helpers.js";

test("Amazon: fixture real extrai quatro ofertas e todos os campos", () => {
  const results = parseAmazonSearch(readFileSync(new URL("./fixtures/amazon-search.html", import.meta.url), "utf8"), "fone bluetooth");
  assert.equal(results.length, 4);
  assert.deepEqual(results[0], {
    source: "amazon", id: "B0DVMQVVDY",
    title: "PHILIPS, Fone de Ouvido Sem Fio TWS, TAT1109BK/00, Bluetooth, Com Microfone, Até 24 horas de bateria, Preto",
    price: 109.9, originalPrice: 144, rating: 4.6, reviews: 8084,
    imageUrl: "https://m.media-amazon.com/images/I/519bjoeFBTL._AC_UL320_.jpg",
    keyword: "fone bluetooth", url: "https://www.amazon.com.br/dp/B0DVMQVVDY",
  });
  assert.deepEqual(results.map(o => o.id), ["B0DVMQVVDY", "B0FXNJCLRP", "B0FJMHMCBZ", "B0BTYCRJSS"]);
});

test("Amazon: ignora bloco patrocinado e detecta captcha", () => {
  const block = (label: string) => `<div data-component-type="s-search-result" data-asin="s"><h2>Fone</h2><span class="a-price"><span class="a-offscreen">R$ 10,00</span></span>${label}</div>`;
  assert.equal(parseAmazonSearch(block(""), "fone").length, 1);
  assert.deepEqual(parseAmazonSearch(block('<span class="puis-sponsored-label-text">Anúncio</span>') + block("Patrocinado"), "fone"), []);
  assert.throws(() => parseAmazonSearch("<form action='/validateCaptcha'>captcha</form>", ""), CaptchaError);
});

test("parseBrl: formatos válidos e lixo", () => {
  for (const value of ["R$ 1.197,90", "1197.90", 1197.9]) assert.equal(parseBrl(value), 1197.9);
  for (const value of ["lixo", "", "1,2,3", undefined, null, NaN, Infinity]) assert.equal(parseBrl(value), undefined);
});

const node = { itemId: 123, productName: " Fone ", price: "80", priceDiscountRate: 20, productLink: "https://shopee.com.br/item", offerLink: "https://s.shopee.com.br/af" };

test("Shopee: assinatura SHA256 independente", () => {
  const payload = '{"query":"teste"}';
  const hash = createHash("sha256").update("app" + 123 + payload + "secret").digest("hex");
  assert.equal(shopeeAuthHeader("app", "secret", payload, 123), `SHA256 Credential=app, Timestamp=123, Signature=${hash}`);
});

test("Shopee: mapeia desconto e afiliado, descarta nós inválidos", () => {
  const mapped = mapShopeeNode(node, "fone");
  assert.equal(mapped?.originalPrice, 100);
  assert.equal(mapped?.affiliateUrl, node.offerLink);
  assert.equal(mapped?.title, "Fone");
  assert.equal(mapped?.id, "123");
  for (const invalid of [{ price: "x" }, { price: "0" }, { productName: "" }, { offerLink: "" }]) {
    assert.equal(mapShopeeNode({ ...node, ...invalid }, ""), undefined);
  }
});

test("ShopeeSource: fetch falso, payload, sucesso e errors", async t => {
  const mocked = t.mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.match(String(init?.body), /fone/);
    assert.equal(init?.method, "POST");
    assert.match(new Headers(init?.headers).get("authorization")!, /^SHA256 Credential=app/);
    return Response.json({ data: { productOfferV2: { nodes: [node, { ...node, price: "x" }] } } });
  });
  const source = new ShopeeSource("app", "secret");
  assert.equal((await source.search("fone", 5)).length, 1);
  assert.equal(mocked.mock.calls[0]?.arguments[0], "https://open-api.affiliate.shopee.com.br/graphql");
  mocked.mock.mockImplementation(async () => Response.json({ errors: [{ message: "negado" }] }));
  await assert.rejects(source.search("fone", 5), /Shopee: negado/);
});

test("Afiliados: Amazon preserva parâmetros e substitui tag; ML e Shopee", () => {
  for (const url of ["https://amazon.com.br/dp/a?x=1", "https://amazon.com.br/dp/a?x=1&tag=velha"]) {
    const result = new URL(buildAffiliateUrl(offer({ url }), { amazon: { tag: "nova" } })!);
    assert.equal(result.searchParams.get("tag"), "nova");
    assert.equal(result.searchParams.get("x"), "1");
    assert.equal(result.searchParams.getAll("tag").length, 1);
  }
  const ml = new URL(buildAffiliateUrl(offer({ source: "mercadolivre" }), { mercadolivre: { params: { matt_tool: "123" } } })!);
  assert.equal(ml.searchParams.get("matt_tool"), "123");
  assert.equal(buildAffiliateUrl(offer({ source: "shopee", affiliateUrl: node.offerLink }), {}), node.offerLink);
  for (const source of ["amazon", "mercadolivre", "shopee"] as const) assert.equal(buildAffiliateUrl(offer({ source }), {}), undefined);
});
