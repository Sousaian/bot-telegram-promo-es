import test from "node:test";
import assert from "node:assert/strict";
import { AnthropicClient, OpenAICompatibleClient, extractJson } from "../src/llm/client.js";

for (const provider of ["openai", "openrouter"] as const) {
  test(`LLM ${provider}: URL, headers e tokens`, async () => {
    const fake: typeof fetch = async (url, init) => {
      assert.equal(url, provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer chave");
      if (provider === "openrouter") {
        assert.equal(headers.get("http-referer"), "https://github.com/Sousaian/bot-telegram-promo-es");
        assert.equal(headers.get("x-title"), "bot-telegram-promocoes");
      }
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: "modelo", messages: [{ role: "system", content: "sistema" }, { role: "user", content: "usuário" }],
        ...(provider === "openai" ? { max_completion_tokens: 42 } : { max_tokens: 42 }),
      });
      return Response.json({ choices: [{ message: { content: "resposta" } }] });
    };
    assert.equal(await new OpenAICompatibleClient(provider, "chave", "modelo", fake).complete({ system: "sistema", user: "usuário", maxTokens: 42 }), "resposta");
  });
}

test("Anthropic: headers, system separado e concatenação de texto", async () => {
  const fake: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-api-key"), "chave");
    assert.equal(headers.get("anthropic-version"), "2023-06-01");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "modelo", max_tokens: 1500, system: "s", messages: [{ role: "user", content: "u" }],
    });
    return Response.json({ content: [{ type: "text", text: "um" }, { type: "tool_use", text: "ignorar" }, { type: "text", text: "dois" }] });
  };
  assert.equal(await new AnthropicClient("chave", "modelo", fake).complete({ system: "s", user: "u" }), "umdois");
});

test("LLM: status HTTP não 2xx lança erro nos dois clientes", async () => {
  const fake: typeof fetch = async () => new Response("indisponível", { status: 503 });
  for (const client of [new AnthropicClient("k", "m", fake), new OpenAICompatibleClient("openai", "k", "m", fake)]) {
    await assert.rejects(client.complete({ system: "", user: "" }), /503: indisponível/);
  }
});

test("extractJson: cercas, texto em volta e resposta sem JSON", () => {
  for (const text of ['```json\n{"picks":[]}\n```', 'antes {"picks":[]} depois']) assert.deepEqual(extractJson(text), { picks: [] });
  assert.throws(() => extractJson("sem objeto"), /sem JSON/);
});
