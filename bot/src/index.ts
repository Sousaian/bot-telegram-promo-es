import { bot } from './bot/instance';
import { checkAndSendPromos } from './bot/schedule';
import { startServer } from './api/server';

import dotenv from 'dotenv';
dotenv.config();

bot.launch();
console.log('🤖 Bot is running...');
console.log('⏱️ Agendando verificação de promoções a cada 5 minutos...');

setInterval(checkAndSendPromos, 5 * 60 * 1000);

startServer();

process.on('uncaughtException', (err) => {
  console.error('Erro inesperado:', err);
});
