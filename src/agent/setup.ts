import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLlmClient } from "../llm/client.js";
import { SentStore } from "../promos/sentStore.js";
import type { PromoPublisher } from "../telegram/publisher.js";
import { PromoAgent } from "./agent.js";
import { loadAgentConfig, type AgentConfig, type AgentSecrets } from "./config.js";
import { HeuristicCurator, LlmCurator } from "./curator.js";
import { AmazonSource } from "./sources/amazon.js";
import { MercadoLivreSource } from "./sources/mercadolivre.js";
import { ShopeeSource } from "./sources/shopee.js";
import type { OfferSource, SourceId } from "./types.js";

/**
 * Carrega o config do agente se o arquivo existir.
 * Sem arquivo → undefined (agente desligado). Arquivo inválido → lança erro.
 */
export function loadAgentConfigIfPresent(path: string): { config: AgentConfig; secrets: AgentSecrets } | undefined {
  if (!existsSync(path)) return undefined;
  return loadAgentConfig(path);
}

/** Histórico de enviadas persistido em DATA_DIR/sent.json (TTL = repostAfterDays). */
export function createSentStore(dataDir: string, repostAfterDays?: number): SentStore {
  return new SentStore(undefined, {
    filePath: join(dataDir, "sent.json"),
    ttlMs: repostAfterDays ? repostAfterDays * 86_400_000 : undefined,
  });
}

/** Monta o agente a partir do config + credenciais. */
export function buildAgent(config: AgentConfig, secrets: AgentSecrets, publisher: PromoPublisher, sent: SentStore) {
  const sources: Partial<Record<SourceId, OfferSource>> = { amazon: new AmazonSource() };
  if (secrets.shopee) sources.shopee = new ShopeeSource(secrets.shopee.appId, secrets.shopee.secret);
  if (secrets.mercadolivre) {
    sources.mercadolivre = new MercadoLivreSource(secrets.mercadolivre.clientId, secrets.mercadolivre.clientSecret);
  }

  const heuristic = new HeuristicCurator();
  const llm =
    config.llm && secrets.llmApiKey
      ? createLlmClient(config.llm.provider, config.llm.model, secrets.llmApiKey)
      : undefined;

  const agent = new PromoAgent({
    sources,
    affiliates: config.affiliates,
    publisher,
    sent,
    curators: { heuristic, llm: llm ? new LlmCurator(llm, heuristic) : undefined },
    delayBetweenPostsMs: config.delayBetweenPostsSeconds * 1000,
  });
  return { agent, llmLabel: llm?.label };
}
