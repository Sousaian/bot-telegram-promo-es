import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { TELEGRAM_TOKEN } from './config/config';
import { startServer } from './api/server';

dotenv.config();

const bot = new Telegraf(TELEGRAM_TOKEN);

bot.start((ctx) => ctx.reply('Bot iniciado com sucesso!'));

bot.launch();
console.log('🤖 Bot rodando...');

// Inicia servidor HTTP para receber promoções
startServer();
