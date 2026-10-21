import type { Server } from "node:http";
import { loadConfig } from "./config/env.js";
import { createApp } from "./http/app.js";
import { PromoPoller } from "./promos/poller.js";
import { SentStore } from "./promos/sentStore.js";
import { HttpPromoSource } from "./promos/source.js";
import { createBot } from "./telegram/bot.js";
import { TelegramPromoPublisher } from "./telegram/publisher.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const bot = createBot(config.telegramToken);
  const publisher = new TelegramPromoPublisher(bot.telegram, config.groupId);
  const sent = new SentStore();

  // Valida o token antes de subir o resto
  const me = await bot.telegram.getMe();
  console.log(`🤖 Bot conectado como @${me.username}`);

  // Long polling de comandos (/start, /help, /chatid). Não bloqueia o processo.
  bot.launch().catch((err) => {
    console.error("[bot] long polling encerrado com erro:", err);
    process.exitCode = 1;
  });

  let poller: PromoPoller | undefined;
  if (config.backendUrl) {
    poller = new PromoPoller(new HttpPromoSource(config.backendUrl), publisher, sent, config.pollIntervalMs);
    poller.start();
    console.log(`⏱️  Buscando promoções em ${config.backendUrl} a cada ${config.pollIntervalMs / 60_000} min`);
  } else {
    console.log("⏸️  BACKEND_URL não definida: polling desligado (apenas API HTTP)");
  }

  const app = createApp({ publisher, sent, apiKey: config.apiKey });
  const server: Server = app.listen(config.port, () => {
    console.log(`🌐 API escutando na porta ${config.port}${config.apiKey ? " (com API_KEY)" : ""}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} recebido, encerrando...`);
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
