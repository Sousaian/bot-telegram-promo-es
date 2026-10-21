import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PromoAgent, offerToPromo, type AgentDeps, type JobReport } from "../src/agent/agent.js";
import { HeuristicCurator } from "../src/agent/curator.js";
import { JobScheduler } from "../src/agent/scheduler.js";
import { SentStore } from "../src/promos/sentStore.js";
import { offerSentKey, type Offer } from "../src/agent/types.js";
import { formatPromoMessage } from "../src/telegram/format.js";
import { job, offer } from "./agent-helpers.js";

function deps(items: Offer[]): AgentDeps {
  return {
    sources: { amazon: { id: "amazon", search: async () => items } },
    affiliates: { amazon: { tag: "teste" } },
    publisher: { publish: async () => {} }, sent: new SentStore(),
    curators: { heuristic: new HeuristicCurator() },
    sleep: async () => {}, delayBetweenPostsMs: 10,
  };
}

test("PromoAgent: filtros de desconto, preço, nota e exclusão normalizada", async () => {
  const items = [
    offer({ id: "ok" }), offer({ id: "desconto", price: 95 }),
    offer({ id: "baixo", price: 5 }), offer({ id: "alto", price: 90, originalPrice: 200 }),
    offer({ id: "nota", rating: 2 }), offer({ id: "excluir", title: "CAPA de ÁUDIO" }),
  ];
  const report = await new PromoAgent(deps(items)).runJob(job({
    minDiscount: 20, minPrice: 10, maxPrice: 80, minRating: 4, exclude: ["capa de audio"],
  }));
  assert.equal(report.found, 6);
  assert.equal(report.candidates, 1);
  assert.deepEqual(report.published.map(p => p.offer.id), ["ok"]);
});

test("PromoAgent: dedup entre keywords mantém menor preço e histórico impede reenvio", async () => {
  const d = deps([]);
  d.sources.amazon!.search = async keyword => [offer({ price: keyword === "a" ? 60 : 40 })];
  const agent = new PromoAgent(d);
  const config = job({ keywords: ["a", "b"] });
  const report = await agent.runJob(config);
  assert.equal(report.found, 2);
  assert.equal(report.candidates, 1);
  assert.equal(report.published[0]?.offer.price, 40);
  assert.ok(d.sent.has(offerSentKey(offer({ price: 40 }))));
  // Mesma oferta/preço já enviada não volta à curadoria.
  d.sources.amazon!.search = async () => [offer({ price: 40 })];
  assert.equal((await agent.runJob(config)).published.length, 0);
});

test("PromoAgent: ignora ofertas sem link de afiliado", async () => {
  const d = deps([offer()]);
  d.affiliates = {};
  const report = await new PromoAgent(d).runJob(job());
  assert.equal(report.candidates, 0);
  assert.equal(report.published.length, 0);
});

test("PromoAgent: dryRun não publica nem grava histórico", async () => {
  const d = deps([offer()]);
  let calls = 0;
  d.publisher.publish = async () => { calls++; };
  const report = await new PromoAgent(d).runJob(job(), { dryRun: true });
  assert.equal(report.dryRun, true);
  assert.equal(report.published.length, 1);
  assert.equal(calls, 0);
  assert.equal(d.sent.size, 0);
});

test("PromoAgent: erros de fonte e publicação, chatId e sleep falsos", async () => {
  const d = deps([offer(), offer({ id: "b" }), offer({ id: "c", title: "Falha" })]);
  d.sources.shopee = { id: "shopee", search: async () => { throw new Error("fonte offline"); } };
  const chats: (string | undefined)[] = [];
  const sleeps: number[] = [];
  d.sleep = async ms => { sleeps.push(ms); };
  d.publisher.publish = async (promo, options) => {
    chats.push(options?.chatId);
    if (promo.nome === "Falha") throw new Error("envio offline");
  };
  const report = await new PromoAgent(d).runJob(job({ sources: ["amazon", "shopee"], chatId: "-123" }));
  assert.equal(report.failed, 1);
  assert.equal(report.published.length, 2);
  assert.equal(report.errors.length, 2);
  assert.match(report.errors.join("\n"), /fonte offline/);
  assert.match(report.errors.join("\n"), /envio offline/);
  assert.deepEqual(chats, ["-123", "-123", "-123"]);
  assert.deepEqual(sleeps, [10, 10]);
  assert.equal(d.sent.has(offerSentKey(offer({ id: "c" }))), false);
});

test("offerToPromo e formatação: afiliado, chamada, loja, preço original e desconto", () => {
  const promo = offerToPromo({ offer: offer(), headline: "Oferta especial" }, "https://example.com/afiliado");
  assert.equal(promo.url, "https://example.com/afiliado");
  assert.equal(promo.loja, "Amazon");
  assert.equal(promo.chamada, "Oferta especial");
  const message = formatPromoMessage(promo);
  assert.match(message, /De <s>R\$ 100,00<\/s> por/);
  assert.match(message, /-50%/);
  assert.match(message, /<b>Oferta especial<\/b>/);
  assert.match(message, /Loja: <i>Amazon<\/i>/);
});

test("SentStore: TTL expira com now explícito", () => {
  const store = new SentStore(10, { ttlMs: 100 });
  store.add("x", 1000);
  assert.equal(store.has("x", 1050), true);
  assert.equal(store.has("x", 1101), false);
});

test("SentStore: arquivo persiste entre instâncias; corrupção não derruba", t => {
  const dir = mkdtempSync(join(tmpdir(), "agent-sent-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, "nested", "sent.json");
  new SentStore(10, { filePath }).add("x", 1000);
  assert.equal(new SentStore(10, { filePath }).has("x", 1001), true);
  writeFileSync(filePath, "{inválido");
  assert.equal(new SentStore(10, { filePath }).size, 0);
});

const report = (): JobReport => ({
  job: "audio", startedAt: new Date(), durationMs: 0, found: 0, candidates: 0,
  published: [], failed: 0, errors: [], dryRun: false,
});

test("Scheduler: run executa runner, report e job inexistente", async () => {
  const config = job();
  let calls = 0;
  const expected = report();
  const scheduler = new JobScheduler([config], async (received, ..._extra: unknown[]) => {
    assert.equal(received, config);
    calls++;
    return expected;
  }, "America/Sao_Paulo");
  assert.equal(await scheduler.run(config.name), expected);
  assert.equal(calls, 1);
  assert.equal(scheduler.list()[0]?.lastReport, expected);
  await assert.rejects(scheduler.run("inexistente"), /não existe/);
});

test("Scheduler: impede concorrência e libera após conclusão", async () => {
  let release!: (value: JobReport) => void;
  const scheduler = new JobScheduler([job()], async (_job, ..._extra: unknown[]) => new Promise<JobReport>(resolve => { release = resolve; }), "America/Sao_Paulo");
  const pending = scheduler.run("audio");
  assert.equal(scheduler.list()[0]?.running, true);
  await assert.rejects(scheduler.run("audio"), /já está em execução/);
  release(report());
  await pending;
  assert.equal(scheduler.list()[0]?.running, false);
});

test("Scheduler: start preenche nextRun; stop limpa sem aguardar cron", t => {
  const scheduler = new JobScheduler([job()], async (_job, ..._extra: unknown[]) => report(), "America/Sao_Paulo");
  t.after(() => scheduler.stop());
  assert.equal(scheduler.list()[0]?.nextRun, null);
  scheduler.start();
  assert.ok(scheduler.list()[0]?.nextRun instanceof Date);
  scheduler.stop();
  assert.equal(scheduler.list()[0]?.nextRun, null);
});
