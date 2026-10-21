import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { createApp } from "../src/http/app.js";
import { SentStore } from "../src/promos/sentStore.js";
import { FakePublisher, samplePromo } from "./helpers.js";

describe("API HTTP", () => {
  const publisher = new FakePublisher();
  let server: Server;
  let base: string;

  before(async () => {
    const app = createApp({ publisher, sent: new SentStore(), apiKey: "segredo" });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (body: unknown, headers: Record<string, string> = { "x-api-key": "segredo" }, query = "") =>
    fetch(`${base}/promo${query}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("GET /health responde ok", async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string };
    assert.equal(body.status, "ok");
  });

  it("exige API key", async () => {
    assert.equal((await post(samplePromo(), {})).status, 401);
    assert.equal((await post(samplePromo(), { "x-api-key": "errada" })).status, 401);
  });

  it("valida o corpo", async () => {
    const res = await post({ nome: "x" });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { details: string[] };
    assert.ok(body.details.length > 0);
    assert.equal((await post("{json quebrado")).status, 400);
  });

  it("publica, bloqueia duplicada e permite forçar", async () => {
    assert.equal((await post(samplePromo())).status, 201);
    assert.equal((await post(samplePromo())).status, 409);
    assert.equal((await post(samplePromo(), undefined, "?force=true")).status, 201);
    assert.equal(publisher.published.length, 2);
  });

  it("responde 502 quando o Telegram falha", async () => {
    publisher.failOn.add("Quebrada");
    assert.equal((await post(samplePromo({ nome: "Quebrada", url: "https://x.com/q" }))).status, 502);
  });
});
