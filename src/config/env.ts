export interface Config {
  telegramToken: string;
  groupId: string;
  backendUrl: string | undefined;
  pollIntervalMs: number;
  port: number;
  apiKey: string | undefined;
}

type Env = Record<string, string | undefined>;

function optional(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function required(env: Env, name: string, errors: string[]): string {
  const value = optional(env, name);
  if (!value) errors.push(`${name} é obrigatória`);
  return value ?? "";
}

function positiveNumber(env: Env, name: string, fallback: number, errors: string[]): number {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`${name} deve ser um número positivo (recebido: "${raw}")`);
    return fallback;
  }
  return value;
}

/** Lê e valida as variáveis de ambiente, reportando todos os erros de uma vez. */
export function loadConfig(env: Env = process.env): Config {
  const errors: string[] = [];

  const config: Config = {
    telegramToken: required(env, "TELEGRAM_TOKEN", errors),
    groupId: required(env, "GROUP_ID", errors),
    backendUrl: optional(env, "BACKEND_URL"),
    pollIntervalMs: positiveNumber(env, "POLL_INTERVAL_MINUTES", 5, errors) * 60_000,
    port: positiveNumber(env, "PORT", 3000, errors),
    apiKey: optional(env, "API_KEY"),
  };

  if (config.backendUrl && !URL.canParse(config.backendUrl)) {
    errors.push(`BACKEND_URL não é uma URL válida: "${config.backendUrl}"`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuração inválida:\n  - ${errors.join("\n  - ")}`);
  }
  return config;
}
