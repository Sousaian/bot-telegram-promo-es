export interface AgentEnv {
  /** Caminho do agent.config.json (AGENT_CONFIG). */
  agentConfigPath: string;
  /** Diretório de dados persistentes, ex.: histórico de enviadas (DATA_DIR). */
  dataDir: string;
  /** IDs do Telegram autorizados a comandos administrativos (ADMIN_IDS). */
  adminIds: number[];
}

export interface Config extends AgentEnv {
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

function integerList(env: Env, name: string, errors: string[]): number[] {
  const raw = optional(env, name);
  if (raw === undefined) return [];
  const values: number[] = [];
  for (const part of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const value = Number(part);
    if (!/^-?\d+$/.test(part) || !Number.isSafeInteger(value)) {
      errors.push(`${name} deve conter apenas IDs inteiros separados por vírgula (inválido: "${part}")`);
      continue;
    }
    values.push(value);
  }
  return values;
}

function collectAgentEnv(env: Env, errors: string[]): AgentEnv {
  return {
    agentConfigPath: optional(env, "AGENT_CONFIG") ?? "./agent.config.json",
    dataDir: optional(env, "DATA_DIR") ?? "./data",
    adminIds: integerList(env, "ADMIN_IDS", errors),
  };
}

function throwIfErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Configuração inválida:\n  - ${errors.join("\n  - ")}`);
  }
}

/** Só as variáveis do agente (usado pela CLI, que pode rodar sem Telegram). */
export function loadAgentEnv(env: Env = process.env): AgentEnv {
  const errors: string[] = [];
  const agentEnv = collectAgentEnv(env, errors);
  throwIfErrors(errors);
  return agentEnv;
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
    ...collectAgentEnv(env, errors),
  };

  if (config.backendUrl && !URL.canParse(config.backendUrl)) {
    errors.push(`BACKEND_URL não é uma URL válida: "${config.backendUrl}"`);
  }

  throwIfErrors(errors);
  return config;
}
