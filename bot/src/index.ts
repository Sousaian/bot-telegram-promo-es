import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Example command handler
bot.start((ctx) => ctx.reply('Welcome! I am your Amazon affiliate bot 🚀'));

// Example text handler
bot.on('text', (ctx) => {
  ctx.reply(`You said: ${ctx.message.text}`);
});

// Launch the bot
bot.launch();

console.log('🤖 Bot is running...');
