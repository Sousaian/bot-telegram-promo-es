import type { Offer } from "../src/agent/types.js";
import { parseAgentConfig, type JobConfig } from "../src/agent/config.js";

export const offer = (overrides: Partial<Offer> = {}): Offer => ({
  source: "amazon", id: "a", title: "Fone", price: 50, originalPrice: 100,
  rating: 4.5, keyword: "fone", url: "https://www.amazon.com.br/dp/a", ...overrides,
});

export const job = (overrides: Partial<JobConfig> = {}): JobConfig => ({
  ...parseAgentConfig({
    affiliates: { amazon: { tag: "teste-20" } },
    jobs: [{ name: "audio", schedule: "0 0 1 1 *", keywords: ["fone"], sources: ["amazon"] }],
  }, {}).config.jobs[0]!, ...overrides,
});
