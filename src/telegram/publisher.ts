import type { Telegram } from "telegraf";
import type { Promo } from "../domain/promo.js";
import { formatPromoMessage } from "./format.js";

/** Contrato mínimo usado para publicar; facilita testes sem a API real. */
export interface PromoPublisher {
  publish(promo: Promo): Promise<void>;
}

type TelegramSender = Pick<Telegram, "sendMessage" | "sendPhoto">;

export class TelegramPromoPublisher implements PromoPublisher {
  constructor(
    private readonly telegram: TelegramSender,
    private readonly chatId: string,
  ) {}

  /** Publica a promoção. Lança erro se o Telegram recusar o envio. */
  async publish(promo: Promo): Promise<void> {
    const text = formatPromoMessage(promo);

    if (promo.imagem) {
      await this.telegram.sendPhoto(this.chatId, promo.imagem, { caption: text, parse_mode: "HTML" });
      return;
    }
    await this.telegram.sendMessage(this.chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: false },
    });
  }
}
