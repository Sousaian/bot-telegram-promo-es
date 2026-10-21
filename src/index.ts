import type { Server } from "node:http";
import { Telegram } from "telegraf";
import { summarizeReport } from "./agent/agent.js";
import { formatDateTime, JobScheduler } from "./agent/scheduler.js";
import { buildAgent, createSentStore, loadAgentConfigIfPresent } from "./agent/setup.js";
import { loadConfig } from "./config/env.js";
import { createApp } from "./http/app.js";
import { PromoPoller } from "./promos/poller.js";
import { HttpPromoSource } from "./promos/source.js";
import { createBot } from "./telegram/bot.js";
import { TelegramPromoPublisher } from "./telegram/publisher.js";

async function main(): Promise<void> {
  const config = loadConfig();
  // Sem arquivo → agente desligado; arquivo inválido → lança e o processo sai com erro
  const agentSetup = loadAgentConfigIfPresent(config.agentConfigPath);

  const publisher = new TelegramPromoPublisher(new Telegram(config.telegramToken), config.groupId);
  const sent = createSentStore(config.dataDir, agentSetup?.config.repostAfterDays);

  let scheduler: JobScheduler | undefined;
  if (agentSetup) {
    const { agent, llmLabel } = buildAgent(agentSetup.config, agentSetup.secrets, publisher, sent);
    scheduler = new JobScheduler(
      agentSetup.config.jobs,
      (job, opts) => agent.runJob(job, opts),
      agentSetup.config.timezone,
      (report) => console.log(summarizeReport(report)),
    );
    console.log(`🧠 Agente carregado de ${config.agentConfigPath} (curadoria: ${llmLabel ?? "heurística"})`);
  } else {
    console.log(`⏸️  ${config.agentConfigPath} não encontrado: agente desligado`);
  }

  const bot = createBot(config.telegramToken, { adminIds: config.adminIds, jobs: scheduler });

  // Valida o token antes de subir o resto
  const me = await bot.telegram.getMe();
  console.log(`🤖 Bot conectado como @${me.username}`);
  if (config.adminIds.length === 0) console.log("🔒 ADMIN_IDS vazio: comandos administrativos desabilitados");

  // Long polling de comandos. Não bloqueia o processo.
  bot.launch().catch((err) => {
    console.error("[bot] long polling encerrado com erro:", err);
    process.exitCode = 1;
  });

  if (scheduler) {
    scheduler.start();
    const tz = scheduler.timezone;
    for (const job of scheduler.list()) {
      const next = job.nextRun ? formatDateTime(job.nextRun, tz) : "—";
      const status = job.enabled ? `próxima execução ${next} (${tz})` : "desativado";
      console.log(`🗓️  job ${job.name} [${job.schedule}] ${job.keywords.join(", ")} → ${status}`);
    }
  }

  let poller: PromoPoller | undefined;
  if (config.backendUrl) {
    poller = new PromoPoller(new HttpPromoSource(config.backendUrl), publisher, sent, config.pollIntervalMs);
    poller.start();
    console.log(`⏱️  Buscando promoções em ${config.backendUrl} a cada ${config.pollIntervalMs / 60_000} min`);
  } else {
    console.log("⏸️  BACKEND_URL não definida: polling legado desligado");
  }

  const app = createApp({ publisher, sent, apiKey: config.apiKey, jobs: scheduler });
  const server: Server = app.listen(config.port, () => {
    console.log(`🌐 API escutando na porta ${config.port}${config.apiKey ? " (com API_KEY)" : ""}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} recebido, encerrando...`);
    scheduler?.stop();
    poller?.stop();
    bot.stop(signal);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
