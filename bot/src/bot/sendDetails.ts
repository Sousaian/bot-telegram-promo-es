import { GROUP_ID } from '../config/config';
import { bot } from './instance'; // Se você separou o bot em arquivo próprio

type PromoData = {
  nome: string;
  preco: number;
  categoria: string;
  url: string;
  imagem?: string;
};


export async function sendPromoToGroup(data: PromoData) {
  const { nome, preco, categoria, url, imagem } = data;

  const msg = `🔥 *Promoção encontrada!*\n\n🛍️ *${nome}*\n💰 *R$${preco.toFixed(2)}*\n📦 Categoria: _${categoria}_\n\n🔗 [Compre aqui](${url})`;

  if (imagem) {
    await bot.telegram.sendPhoto(GROUP_ID, imagem, {
      caption: msg,
      parse_mode: 'Markdown',
    });
  } else {
    await bot.telegram.sendMessage(GROUP_ID, msg, {
      parse_mode: 'Markdown',
    });
  }
}