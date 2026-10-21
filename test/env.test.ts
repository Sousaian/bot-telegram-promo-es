import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config/env.js";

describe("loadConfig", () => {
  it("aplica valores padrão", () => {
    const c = loadConfig({ TELEGRAM_TOKEN: "t", GROUP_ID: "-100" });
    assert.equal(c.pollIntervalMs, 5 * 60_000);
    assert.equal(c.port, 3000);
    assert.equal(c.backendUrl, undefined);
    assert.equal(c.apiKey, undefined);
  });

  it("lê os valores informados", () => {
    const c = loadConfig({
      TELEGRAM_TOKEN: "t", GROUP_ID: "-100", BACKEND_URL: "http://x/promos",
      POLL_INTERVAL_MINUTES: "0.5", PORT: "8080", API_KEY: "k",
    });
    assert.equal(c.pollIntervalMs, 30_000);
    assert.equal(c.port, 8080);
    assert.equal(c.backendUrl, "http://x/promos");
    assert.equal(c.apiKey, "k");
  });

  it("reporta todos os erros juntos", () => {
    assert.throws(
      () => loadConfig({ POLL_INTERVAL_MINUTES: "abc", BACKEND_URL: "nao-e-url" }),
      (err: Error) =>
        ["TELEGRAM_TOKEN", "GROUP_ID", "POLL_INTERVAL_MINUTES", "BACKEND_URL"].every((v) => err.message.includes(v)),
    );
  });
});
