import { Telegraf } from 'telegraf';
import { TELEGRAM_TOKEN } from './config/config';

const bot = new Telegraf(TELEGRAM_TOKEN);

// Handlers
bot.start((ctx) => ctx.reply('Welcome! I am your Amazon affiliate bot 🚀'));
bot.on('text', (ctx) => ctx.reply(`You said: ${ctx.message.text}`));

// Start
bot.launch();
console.log('🤖 Bot is running...');

export default bot;
