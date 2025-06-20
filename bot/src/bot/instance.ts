import { Telegraf } from 'telegraf';
import { TELEGRAM_TOKEN } from '../config/config';

export const bot = new Telegraf(TELEGRAM_TOKEN);
