import { readFileSync } from "node:fs";
import { Cron } from "croner";
import { z } from "zod";
import { LLM_KEY_ENV, type LlmProvider } from "../llm/client.js";

const sourceId = z.enum(["amazon", "shopee", "mercadolivre"]);

const jobSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i, "use letras, números, - ou _"),
    schedule: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1),
    sources: z.array(sourceId).min(1).default(["amazon", "shopee"]),
    maxPosts: z.number().int().min(1).max(20).default(3),
    perKeyword: z.number().int().min(1).max(50).default(15),
    minDiscount: z.number().min(0).max(95).default(10),
    minRating: z.number().min(0).max(5).optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().positive().optional(),
    exclude: z.array(z.string()).default([]),
    instructions: z.string().optional(),
    chatId: z.union([z.string(), z.number()]).transform(String).optional(),
    useLlm: z.boolean().default(true),
    enabled: z.boolean().default(true),
  })
  .strict();

export const agentConfigSchema = z
  .object({
    timezone: z.string().default("America/Sao_Paulo"),
    llm: z
      .object({
        provider: z.enum(["openrouter", "openai", "anthropic"]),
        model: z.string().min(1),
      })
      .strict()
      .optional(),
    affiliates: z
      .object({
        amazon: z.object({ tag: z.string().min(1) }).strict().optional(),
        mercadolivre: z.object({ params: z.record(z.string(), z.string()) }).strict().optional(),
        shopee: z.object({}).strict().optional(),
      })
      .strict()
      .default({}),
    repostAfterDays: z.number().min(0).default(7),
    delayBetweenPostsSeconds: z.number().min(0).default(3),
    jobs: z.array(jobSchema).default([]),
  })
  .strict();

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type JobConfig = z.infer<typeof jobSchema>;

export interface AgentSecrets {
  llmApiKey?: string | undefined;
  shopee?: { appId: string; secret: string } | undefined;
  mercadolivre?: { clientId: string; clientSecret: string } | undefined;
}

type Env = Record<string, string | undefined>;
const env = (e: Env, k: string) => e[k]?.trim() || undefined;

/** Valida o config e cruza com as credenciais do ambiente. Lança com todos os erros. */
export function parseAgentConfig(raw: unknown, e: Env = process.env): { config: AgentConfig; secrets: AgentSecrets } {
  const result = agentConfigSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
    throw new Error(`agent.config.json inválido:\n  - ${lines.join("\n  - ")}`);
  }
  const config = result.data;
  const errors: string[] = [];

  const secrets: AgentSecrets = {};
  if (config.llm) {
    const keyName = LLM_KEY_ENV[config.llm.provider as LlmProvider];
    secrets.llmApiKey = env(e, keyName);
    if (!secrets.llmApiKey) errors.push(`llm.provider = ${config.llm.provider} exige ${keyName} no .env`);
  }
  const shopeeId = env(e, "SHOPEE_APP_ID");
  const shopeeSecret = env(e, "SHOPEE_SECRET");
  if (shopeeId && shopeeSecret) secrets.shopee = { appId: shopeeId, secret: shopeeSecret };
  const mlId = env(e, "ML_CLIENT_ID");
  const mlSecret = env(e, "ML_CLIENT_SECRET");
  if (mlId && mlSecret) secrets.mercadolivre = { clientId: mlId, clientSecret: mlSecret };

  const names = new Set<string>();
  for (const job of config.jobs) {
    if (names.has(job.name)) errors.push(`job "${job.name}" duplicado`);
    names.add(job.name);
    try {
      new Cron(job.schedule, { timezone: config.timezone, paused: true });
    } catch (err) {
      errors.push(`job "${job.name}": schedule inválido "${job.schedule}" (${(err as Error).message})`);
    }
    if (job.minPrice !== undefined && job.maxPrice !== undefined && job.minPrice > job.maxPrice) {
      errors.push(`job "${job.name}": minPrice maior que maxPrice`);
    }
    for (const s of job.sources) {
      if (s === "amazon" && !config.affiliates.amazon) errors.push(`job "${job.name}" usa amazon mas falta affiliates.amazon.tag`);
      if (s === "mercadolivre" && !config.affiliates.mercadolivre) {
        errors.push(`job "${job.name}" usa mercadolivre mas falta affiliates.mercadolivre.params`);
      }
      if (s === "mercadolivre" && !secrets.mercadolivre) {
        errors.push(`job "${job.name}" usa mercadolivre mas faltam ML_CLIENT_ID/ML_CLIENT_SECRET no .env`);
      }
      if (s === "shopee" && !secrets.shopee) errors.push(`job "${job.name}" usa shopee mas faltam SHOPEE_APP_ID/SHOPEE_SECRET no .env`);
    }
  }
  if (errors.length) throw new Error(`agent.config.json inválido:\n  - ${errors.join("\n  - ")}`);
  return { config, secrets };
}

export function loadAgentConfig(path: string, e: Env = process.env) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`não foi possível ler ${path}: ${(err as Error).message}`);
  }
  return parseAgentConfig(raw, e);
}
