import { Cron } from "croner";
import { Telegram } from "telegraf";
import { summarizeReport, type JobReport } from "../agent/agent.js";
import { formatDateTime } from "../agent/scheduler.js";
import { buildAgent, createSentStore, loadAgentConfigIfPresent } from "../agent/setup.js";
import { discountPercent, SOURCE_LABEL } from "../agent/types.js";
import { loadAgentEnv, loadConfig } from "../config/env.js";
import type { PromoPublisher } from "../telegram/publisher.js";
import { formatPrice } from "../telegram/format.js";
import { TelegramPromoPublisher } from "../telegram/publisher.js";

const USAGE = "Uso: npm run agent -- <job> [--dry-run]\n     npm run agent -- --list";

/** Publisher que não envia nada (dry-run sem Telegram). */
const nullPublisher: PromoPublisher = { publish: async () => {} };

function printPicks(report: JobReport): void {
  report.published.forEach(({ offer, headline, affiliateUrl }, i) => {
    const pct = discountPercent(offer);
    console.log(`\n${i + 1}. ${offer.title}`);
    console.log(`   ${formatPrice(offer.price)}${pct ? ` (-${pct}%)` : ""} · ${SOURCE_LABEL[offer.source]}`);
    if (headline) console.log(`   "${headline}"`);
    console.log(`   ${affiliateUrl}`);
  });
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));
  const dryRun = flags.has("--dry-run");
  const list = flags.has("--list");
  const unknown = [...flags].filter((f) => f !== "--dry-run" && f !== "--list");

  if (unknown.length || (!list && positional.length !== 1) || (list && positional.length)) {
    console.error(unknown.length ? `Opção desconhecida: ${unknown.join(", ")}\n${USAGE}` : USAGE);
    return 2;
  }

  const env = loadAgentEnv();
  const setup = loadAgentConfigIfPresent(env.agentConfigPath);
  if (!setup) {
    console.error(`${env.agentConfigPath} não encontrado (defina AGENT_CONFIG ou crie a partir de agent.config.example.json)`);
    return 1;
  }
  const { config, secrets } = setup;

  if (list) {
    if (config.jobs.length === 0) console.log("Nenhum job configurado.");
    for (const job of config.jobs) {
      const next = new Cron(job.schedule, { timezone: config.timezone, paused: true }).nextRun();
      const when = !job.enabled ? "desativado" : next ? `próxima ${formatDateTime(next, config.timezone)}` : "sem próxima execução";
      console.log(`${job.name}  [${job.schedule}]  ${job.sources.join("+")}  ${job.keywords.join(", ")}  → ${when}`);
    }
    console.log(`(fuso ${config.timezone})`);
    return 0;
  }

  const name = positional[0]!;
  const job = config.jobs.find((j) => j.name === name);
  if (!job) {
    console.error(`job "${name}" não existe. Jobs: ${config.jobs.map((j) => j.name).join(", ") || "(nenhum)"}`);
    return 1;
  }

  let publisher = nullPublisher;
  if (!dryRun) {
    const full = loadConfig(); // exige TELEGRAM_TOKEN e GROUP_ID
    publisher = new TelegramPromoPublisher(new Telegram(full.telegramToken), full.groupId);
  }

  const sent = createSentStore(env.dataDir, config.repostAfterDays);
  const { agent, llmLabel } = buildAgent(config, secrets, publisher, sent);
  console.log(`▶️  job ${job.name}${dryRun ? " (dry-run)" : ""} · curadoria: ${job.useLlm && llmLabel ? llmLabel : "heurística"}`);

  const report = await agent.runJob(job, { dryRun });
  console.log(summarizeReport(report));
  printPicks(report);
  return report.failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
