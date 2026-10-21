import type { Telegram } from "telegraf";
import type { Promo } from "../domain/promo.js";
import { formatPromoMessage } from "./format.js";

export interface PublishOptions {
  /** Sobrescreve o chat padrão (GROUP_ID). */
  chatId?: string | undefined;
}

/** Contrato mínimo usado para publicar; facilita testes sem a API real. */
export interface PromoPublisher {
  publish(promo: Promo, options?: PublishOptions): Promise<void>;
}

type TelegramSender = Pick<Telegram, "sendMessage" | "sendPhoto">;

export class TelegramPromoPublisher implements PromoPublisher {
  constructor(
    private readonly telegram: TelegramSender,
    private readonly chatId: string,
  ) {}

  /** Publica a promoção. Se a foto falhar, tenta como texto. Lança erro se o Telegram recusar. */
  async publish(promo: Promo, options: PublishOptions = {}): Promise<void> {
    const chatId = options.chatId ?? this.chatId;
    const text = formatPromoMessage(promo);

    if (promo.imagem) {
      try {
        await this.telegram.sendPhoto(chatId, promo.imagem, { caption: text, parse_mode: "HTML" });
        return;
      } catch (err) {
        console.warn("[publisher] falha ao enviar foto, tentando só texto:", (err as Error).message);
      }
    }
    await this.telegram.sendMessage(chatId, text, { parse_mode: "HTML" });
  }
}
