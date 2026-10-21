import express, { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { parsePromo, promoKey } from "../domain/promo.js";
import type { SentStore } from "../promos/sentStore.js";
import type { PromoPublisher } from "../telegram/publisher.js";

export interface AppDeps {
  publisher: PromoPublisher;
  sent: SentStore;
  apiKey?: string | undefined;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Cria a API HTTP (sem chamar listen, para facilitar testes). */
export function createApp({ publisher, sent, apiKey }: AppDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: Math.round(process.uptime()) });
  });

  const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
    if (!apiKey) return next();
    const provided = req.header("x-api-key");
    if (provided && safeEqual(provided, apiKey)) return next();
    res.status(401).json({ error: "x-api-key ausente ou inválida" });
  };

  app.post("/promo", requireApiKey, async (req, res) => {
    const result = parsePromo(req.body);
    if (!result.ok) {
      res.status(400).json({ error: "promoção inválida", details: result.errors });
      return;
    }

    const force = req.query.force === "true";
    const key = promoKey(result.promo);
    if (!force && sent.has(key)) {
      res.status(409).json({ error: "promoção já publicada (use ?force=true para reenviar)" });
      return;
    }

    try {
      await publisher.publish(result.promo);
      sent.add(key);
      res.status(201).json({ message: "Promoção enviada com sucesso!" });
    } catch (err) {
      console.error("[http] erro ao publicar promoção:", err);
      res.status(502).json({ error: "falha ao enviar a promoção para o Telegram" });
    }
  });

  // JSON malformado e outros erros do Express
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number }).status ?? 500;
    if (status >= 500) console.error("[http] erro inesperado:", err);
    res.status(status).json({ error: status === 400 ? "JSON inválido" : "erro interno" });
  });

  return app;
}
