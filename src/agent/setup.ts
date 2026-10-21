import { createLlmClient } from "../llm/client.js";
import type { SentStore } from "../promos/sentStore.js";
import type { PromoPublisher } from "../telegram/publisher.js";
import { PromoAgent } from "./agent.js";
import type { AgentConfig, AgentSecrets } from "./config.js";
import { HeuristicCurator, LlmCurator } from "./curator.js";
import { AmazonSource } from "./sources/amazon.js";
import { MercadoLivreSource } from "./sources/mercadolivre.js";
import { ShopeeSource } from "./sources/shopee.js";
import type { OfferSource, SourceId } from "./types.js";

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
