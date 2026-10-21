import { Telegraf } from "telegraf";

const HELP = [
  "🤖 Bot de promoções",
  "",
  "/chatid — mostra o ID deste chat (use no GROUP_ID do .env)",
  "/help — mostra esta ajuda",
].join("\n");

/** Cria o bot com os comandos utilitários. */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.start((ctx) => ctx.reply(HELP));
  bot.help((ctx) => ctx.reply(HELP));
  bot.command("chatid", (ctx) => ctx.reply(`ID deste chat: ${ctx.chat.id}`));

  bot.catch((err, ctx) => {
    console.error(`[bot] erro ao processar update ${ctx.update.update_id}:`, err);
  });

  return bot;
}
