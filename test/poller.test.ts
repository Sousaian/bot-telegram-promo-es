import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PromoPoller } from "../src/promos/poller.js";
import { SentStore } from "../src/promos/sentStore.js";
import type { PromoSource } from "../src/promos/source.js";
import { FakePublisher, samplePromo } from "./helpers.js";

describe("PromoPoller", () => {
  it("publica só promoções novas e tenta de novo as que falharam", async () => {
    const promos = [samplePromo({ nome: "A", url: "https://x.com/a" }), samplePromo({ nome: "B", url: "https://x.com/b" })];
    const source: PromoSource = { fetchPromos: async () => promos };
    const publisher = new FakePublisher();
    publisher.failOn.add("B");
    const poller = new PromoPoller(source, publisher, new SentStore(), 60_000);

    assert.deepEqual(await poller.runOnce(), { found: 2, published: 1, skipped: 0, failed: 1 });

    publisher.failOn.clear();
    assert.deepEqual(await poller.runOnce(), { found: 2, published: 1, skipped: 1, failed: 0 });
    assert.deepEqual(publisher.published.map((p) => p.nome), ["A", "B"]);

    assert.deepEqual(await poller.runOnce(), { found: 2, published: 0, skipped: 2, failed: 0 });
  });

  it("republica quando o preço muda", async () => {
    let preco = 100;
    const source: PromoSource = { fetchPromos: async () => [samplePromo({ preco })] };
    const publisher = new FakePublisher();
    const poller = new PromoPoller(source, publisher, new SentStore(), 60_000);

    await poller.runOnce();
    preco = 90;
    await poller.runOnce();
    assert.equal(publisher.published.length, 2);
  });
});

describe("SentStore", () => {
  it("descarta as chaves mais antigas ao passar do limite", () => {
    const store = new SentStore(2);
    store.add("a");
    store.add("b");
    store.add("c");
    assert.equal(store.size, 2);
    assert.equal(store.has("a"), false);
    assert.equal(store.has("c"), true);
  });
});
