import dotenv from "dotenv";
dotenv.config(); 

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const TELEGRAM_TOKEN = getEnv("TELEGRAM_TOKEN");
export const GROUP_ID = getEnv("GROUP_ID");

// export const OPENAI_KEY = getEnv("OPENAI_KEY");
// export const AFFILIATE_TAG = getEnv("AFFILIATE_TAG");
