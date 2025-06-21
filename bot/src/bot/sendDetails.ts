import { GROUP_ID } from '../config/config';
import { bot } from './instance';
import { PromoData } from './types';

export async function sendPromoToGroup(data: PromoData) {
  const { nome, preco, categoria, url, imagem } = data;
  
    const msg = `🔥 *Promoção encontrada!*\n\n🛍️ *${nome}*\n💰 *R$${preco.toFixed(2)}*\n📦 Categoria: _${categoria}_\n\n🔗 [Compre aqui](${url})`;

  try {
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
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem para o grupo:', err);
  }
}
