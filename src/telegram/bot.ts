import { Telegraf, type Context } from "telegraf";
import { summarizeReport, type JobReport } from "../agent/agent.js";
import { formatDateTime, type JobsController } from "../agent/scheduler.js";
import { discountPercent, SOURCE_LABEL } from "../agent/types.js";
import { escapeHtml, formatPrice } from "./format.js";

export interface BotOptions {
  /** IDs autorizados a /jobs, /rodar e /testar. Vazio = comandos admin desabilitados. */
  adminIds?: number[];
  /** Agente (scheduler). Ausente = agente desligado. */
  jobs?: JobsController | undefined;
}

/** Limite de texto de uma mensagem do Telegram. */
export const MAX_MESSAGE_LENGTH = 4096;

const HELP = [
  "🤖 Bot de promoções",
  "",
  "/chatid — mostra o ID deste chat (use no GROUP_ID do .env)",
  "/help — mostra esta ajuda",
  "",
  "Administradores:",
  "/jobs — lista os jobs do agente e a próxima execução",
  "/rodar &lt;job&gt; — executa o job agora e publica",
  "/testar &lt;job&gt; — simula o job e mostra o que seria publicado",
].join("\n");

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Junta blocos em mensagens de até `max` caracteres, sem quebrar um bloco no meio. */
export function chunkMessages(blocks: string[], max = MAX_MESSAGE_LENGTH, separator = "\n\n"): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const raw of blocks) {
    const block = truncate(raw, max);
    if (current && current.length + separator.length + block.length > max) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}${separator}${block}` : block;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Relatório de um job em HTML (cabeçalho + uma entrada por escolha). */
export function formatReportHtml(report: JobReport): string[] {
  const blocks = [`<pre>${escapeHtml(summarizeReport(report))}</pre>`];
  report.published.forEach(({ offer, headline, affiliateUrl }, i) => {
    const pct = discountPercent(offer);
    const lines = [
      `${i + 1}. <b>${escapeHtml(truncate(offer.title, 200))}</b>`,
      `💰 ${formatPrice(offer.price)}${pct ? ` (-${pct}%)` : ""} · 🏪 ${SOURCE_LABEL[offer.source]}`,
    ];
    if (headline) lines.push(`📣 ${escapeHtml(headline)}`);
    lines.push(`🔗 ${escapeHtml(affiliateUrl)}`);
    blocks.push(lines.join("\n"));
  });
  return blocks;
}

export function formatJobsHtml(jobs: JobsController): string[] {
  const list = jobs.list();
  if (list.length === 0) return ["Nenhum job configurado."];
  return [
    `🗓️ <b>Jobs</b> (fuso ${escapeHtml(jobs.timezone)})`,
    ...list.map((j) => {
      const status = !j.enabled ? "⏸️ desativado" : j.running ? "⏳ rodando" : "✅ ativo";
      const next = j.nextRun ? formatDateTime(j.nextRun, jobs.timezone) : "—";
      return [
        `<b>${escapeHtml(j.name)}</b> — ${status}`,
        `cron: <code>${escapeHtml(j.schedule)}</code>`,
        `palavras-chave: ${escapeHtml(j.keywords.join(", "))}`,
        `próxima execução: ${next}`,
      ].join("\n");
    }),
  ];
}

async function replyHtml(ctx: Context, blocks: string[]): Promise<void> {
  for (const text of chunkMessages(blocks)) {
    await ctx.reply(text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  }
}

/** Cria o bot com os comandos utilitários e, se houver agente, os administrativos. */
export function createBot(token: string, options: BotOptions = {}): Telegraf {
  const bot = new Telegraf(token);
  const admins = new Set(options.adminIds ?? []);
  const { jobs } = options;

  bot.start((ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));
  bot.help((ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));
  bot.command("chatid", (ctx) => ctx.reply(`ID deste chat: ${ctx.chat.id}`));

  /** Verifica permissão e agente ligado; responde e devolve undefined se não puder seguir. */
  const guard = async (ctx: Context): Promise<JobsController | undefined> => {
    const userId = ctx.from?.id;
    if (userId === undefined || !admins.has(userId)) {
      await ctx.reply("⛔ Comando restrito a administradores (ADMIN_IDS).");
      return undefined;
    }
    if (!jobs) {
      await ctx.reply("⏸️ Agente desligado (sem agent.config.json).");
      return undefined;
    }
    return jobs;
  };

  bot.command("jobs", async (ctx) => {
    const controller = await guard(ctx);
    if (controller) await replyHtml(ctx, formatJobsHtml(controller));
  });

  const runCommand = (dryRun: boolean) => async (ctx: Context & { payload: string }) => {
    const controller = await guard(ctx);
    if (!controller) return;
    const name = ctx.payload.trim();
    if (!name) {
      await ctx.reply(`Uso: /${dryRun ? "testar" : "rodar"} <job>  (veja /jobs)`);
      return;
    }
    if (!controller.list().some((j) => j.name === name)) {
      await ctx.reply(`Job "${name}" não existe (veja /jobs).`);
      return;
    }
    await ctx.reply(`▶️ Job "${name}" iniciado${dryRun ? " (simulação, nada será publicado)" : ""}...`);
    // Roda fora do handler: o Telegraf derruba handlers que demoram mais de 90s.
    void controller
      .run(name, { dryRun })
      .then((report) => replyHtml(ctx, formatReportHtml(report)))
      .catch((err: unknown) => ctx.reply(`❌ Job "${name}": ${(err as Error).message}`))
      .catch((err: unknown) => console.error("[bot] falha ao responder resultado do job:", err));
  };

  bot.command("rodar", runCommand(false));
  bot.command("testar", runCommand(true));

  bot.catch((err, ctx) => {
    console.error(`[bot] erro ao processar update ${ctx.update.update_id}:`, err);
  });

  return bot;
}
