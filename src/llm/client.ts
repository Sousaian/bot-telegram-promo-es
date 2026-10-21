export type LlmProvider = "openrouter" | "openai" | "anthropic";

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LlmClient {
  readonly label: string;
  complete(req: LlmRequest): Promise<string>;
}

type FetchFn = typeof fetch;

async function postJson(fetchFn: FetchFn, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LLM respondeu ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** OpenAI e OpenRouter (API compatível com /chat/completions). */
export class OpenAICompatibleClient implements LlmClient {
  constructor(
    private readonly provider: "openai" | "openrouter",
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  get label(): string {
    return `${this.provider}/${this.model}`;
  }

  async complete({ system, user, maxTokens = 1500 }: LlmRequest): Promise<string> {
    const isOpenAI = this.provider === "openai";
    const url = isOpenAI ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}` };
    if (!isOpenAI) {
      headers["http-referer"] = "https://github.com/Sousaian/bot-telegram-promo-es";
      headers["x-title"] = "bot-telegram-promocoes";
    }
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(isOpenAI ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    };
    const data = (await postJson(this.fetchFn, url, headers, body)) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM devolveu resposta vazia");
    return content;
  }
}

export class AnthropicClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  get label(): string {
    return `anthropic/${this.model}`;
  }

  async complete({ system, user, maxTokens = 1500 }: LlmRequest): Promise<string> {
    const data = (await postJson(
      this.fetchFn,
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      { model: this.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
    )) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (!text) throw new Error("LLM devolveu resposta vazia");
    return text;
  }
}

export const LLM_KEY_ENV: Record<LlmProvider, string> = {
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export function createLlmClient(provider: LlmProvider, model: string, apiKey: string): LlmClient {
  return provider === "anthropic"
    ? new AnthropicClient(apiKey, model)
    : new OpenAICompatibleClient(provider, apiKey, model);
}

/** Extrai o primeiro objeto JSON de uma resposta (tolera ```json e texto em volta). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("resposta do LLM sem JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}
