import test from "node:test";
import assert from "node:assert/strict";
import { HeuristicCurator, LlmCurator, scoreOffer } from "../src/agent/curator.js";
import { parseAgentConfig } from "../src/agent/config.js";
import { offer } from "./agent-helpers.js";

test("Curadoria heurística: desconto ordena e maxPosts limita", async () => {
  const low = offer({ id: "low", price: 90 });
  const high = offer({ id: "high", price: 20 });
  assert.ok(scoreOffer(high) > scoreOffer(low));
  assert.deepEqual(await new HeuristicCurator().curate({ candidates: [low, high], maxPosts: 1 }), [{ offer: high }]);
});

test("LlmCurator: mapeia ids, ignora inválidos/duplicados, corta chamada e limita", async () => {
  const a = offer();
  const b = offer({ id: "b" });
  const curator = new LlmCurator({ label: "fake", complete: async () => JSON.stringify({ picks: [
    { id: "inexistente" }, { id: "amazon:a", headline: "x".repeat(100) },
    { id: "amazon:a" }, { id: "amazon:b" },
  ] }) });
  const picks = await curator.curate({ candidates: [a, b], maxPosts: 2 });
  assert.deepEqual(picks.map(p => p.offer.id), ["a", "b"]);
  assert.equal(picks[0]?.headline, "x".repeat(80));
  assert.equal((await curator.curate({ candidates: [a, b], maxPosts: 1 })).length, 1);
});

for (const mode of ["erro", "json inválido"]) {
  test(`LlmCurator: fallback com ${mode}`, async () => {
    const candidates = [offer({ price: 90 }), offer({ id: "b", price: 20 })];
    const curator = new LlmCurator({ label: "fake", complete: async () => {
      if (mode === "erro") throw new Error("offline");
      return "{inválido";
    } });
    assert.deepEqual(await curator.curate({ candidates, maxPosts: 1 }), [{ offer: candidates[1] }]);
  });
}

test("Config: aplica defaults", () => {
  const { config, secrets } = parseAgentConfig({}, {});
  assert.equal(config.timezone, "America/Sao_Paulo");
  assert.equal(config.repostAfterDays, 7);
  assert.equal(config.delayBetweenPostsSeconds, 3);
  assert.deepEqual(config.jobs, []);
  assert.deepEqual(secrets, {});
  const parsed = parseAgentConfig({ affiliates: { amazon: { tag: "t" } }, jobs: [
    { name: "j", schedule: "0 0 * * *", keywords: ["fone"], sources: ["amazon"] },
  ] }, {}).config.jobs[0]!;
  assert.equal(parsed.maxPosts, 3);
  assert.equal(parsed.perKeyword, 15);
  assert.equal(parsed.minDiscount, 10);
  assert.deepEqual(parsed.exclude, []);
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.useLlm, true);
});

test("Config: agrega cron, duplicação, afiliado, credenciais, LLM e faixa", () => {
  assert.throws(() => parseAgentConfig({
    llm: { provider: "openai", model: "modelo" },
    jobs: [
      { name: "j", schedule: "inválido", keywords: ["x"], sources: ["amazon", "shopee"], minPrice: 100, maxPrice: 10 },
      { name: "j", schedule: "0 0 * * *", keywords: ["x"], sources: ["amazon"] },
    ],
  }, {}), (error: unknown) => {
    assert.ok(error instanceof Error);
    for (const fragment of ["schedule inválido", "duplicado", "affiliates.amazon.tag", "SHOPEE_APP_ID/SHOPEE_SECRET", "OPENAI_API_KEY", "minPrice maior que maxPrice"]) assert.ok(error.message.includes(fragment), fragment);
    return true;
  });
});

test("Config: strict rejeita campos desconhecidos na raiz e em jobs", () => {
  assert.throws(() => parseAgentConfig({ desconhecido: true }, {}), /inválido/);
  assert.throws(() => parseAgentConfig({ jobs: [{ name: "j", schedule: "* * * * *", keywords: ["x"], desconhecido: true }] }, {}), /desconhecido/);
});
