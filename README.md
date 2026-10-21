# Bot Telegram de Promoções

Bot do Telegram em TypeScript que publica promoções (com link de afiliado) em um grupo ou canal. As promoções chegam por agente agendado, polling ou API HTTP:

- **Agente:** busca ofertas por palavra-chave em Amazon e Shopee (Mercado Livre experimental), filtra, deduplica e seleciona com LLM ou heurística.
- **Polling:** o bot consulta periodicamente um backend que devolve uma lista de promoções e publica só as novas.
- **API HTTP:** qualquer serviço pode mandar um `POST /promo` para publicar na hora.

## Funcionalidades

- Mensagens formatadas em HTML, com preço em reais (`R$ 1.299,90`), categoria, link e foto opcional
- **Deduplicação:** a mesma oferta (mesmo link e mesmo preço) não é publicada duas vezes, e uma queda de preço gera uma nova publicação
- Validação dos dados recebidos (do backend e da API), descartando itens inválidos com log
- API protegida por chave opcional (`x-api-key`) e endpoint `/health`
- Comandos públicos e administrativos para listar, executar e simular jobs
- Histórico com TTL e persistência opcional em JSON; integração usa `DATA_DIR/sent.json`
- Validação das variáveis de ambiente na inicialização, com todos os erros listados de uma vez
- Encerramento limpo com `SIGINT`/`SIGTERM`

## Requisitos

- Node.js **22.9+**
- Um bot criado no [@BotFather](https://t.me/BotFather)

## Configuração

```bash
npm install
cp .env.example .env
```

| Variável | Obrigatória | Padrão | Descrição |
|----------|:-----------:|--------|-----------|
| `TELEGRAM_TOKEN` | sim | | Token do bot |
| `GROUP_ID` | sim | | ID do grupo/canal de destino (ex.: `-1001234567890`) |
| `BACKEND_URL` | não | | URL que devolve o array de promoções. Sem ela, o polling fica desligado |
| `POLL_INTERVAL_MINUTES` | não | `5` | Intervalo entre as buscas |
| `PORT` | não | `3000` | Porta da API HTTP |
| `API_KEY` | não | | Se definida, `/promo` e `/jobs` exigem header `x-api-key` |
| `AGENT_CONFIG` | não | `./agent.config.json` | Ausente → agente desligado; inválido → erro |
| `DATA_DIR` | não | `./data` | Diretório de `sent.json`, compartilhado com poller/API |
| `ADMIN_IDS` | não | vazio | IDs de usuários separados por vírgula; vazio desabilita admin |
| `OPENROUTER_API_KEY` | conforme config | | Chave para `llm.provider: openrouter` |
| `OPENAI_API_KEY` | conforme config | | Chave para `llm.provider: openai` |
| `ANTHROPIC_API_KEY` | conforme config | | Chave para `llm.provider: anthropic` |
| `SHOPEE_APP_ID` | com fonte Shopee | | App ID da Affiliate Open API |
| `SHOPEE_SECRET` | com fonte Shopee | | Secret da Affiliate Open API |
| `ML_CLIENT_ID` | com fonte Mercado Livre | | Client ID experimental |
| `ML_CLIENT_SECRET` | com fonte Mercado Livre | | Client secret experimental |

CLI `--dry-run` dispensa `TELEGRAM_TOKEN` e `GROUP_ID`.

> Para descobrir o `GROUP_ID`, adicione o bot ao grupo e mande `/chatid`. Para publicar em um canal, o bot precisa ser administrador.

## Agente de promoções

Após criar `.env`:

```bash
cp agent.config.example.json agent.config.json
```

Editar `affiliates.amazon.tag`; preencher `OPENROUTER_API_KEY`, `SHOPEE_APP_ID` e `SHOPEE_SECRET` no `.env`.
Para publicar → preencher também `TELEGRAM_TOKEN` e `GROUP_ID`.

```bash
npm run agent -- eletronicos-hora-em-hora --dry-run
npm run dev
```

[Guia completo: configuração, cron, afiliados, custos e troubleshooting](docs/agente.md).

## Comandos

| Comando | Acesso / resultado |
|---|---|
| `/start`, `/help` | Todos → ajuda |
| `/chatid` | Todos → ID do chat |
| `/jobs` | `ADMIN_IDS` → jobs, cron, palavras-chave e próxima execução no fuso do config |
| `/rodar <job>` | `ADMIN_IDS` → executa e publica agora |
| `/testar <job>` | `ADMIN_IDS` → simula e responde escolhas com título, preço, desconto, loja e link |
| `npm run agent -- --list` | CLI → lista jobs |
| `npm run agent -- <job> [--dry-run]` | CLI → execução única e relatório; simulação não publica |

## Uso

```bash
npm run dev            # desenvolvimento (recarrega ao salvar)
npm run mock-backend   # backend falso em http://localhost:4000/mock-promos

npm run build && npm start   # produção (roda o JS compilado em dist/)
```

Para testar o fluxo completo localmente, rode `npm run mock-backend` em um terminal e `npm run dev` em outro, com `BACKEND_URL=http://localhost:4000/mock-promos` no `.env`.

## Formato da promoção

O backend deve responder um **array** de objetos neste formato, que também é o corpo do `POST /promo`:

```json
{
  "nome": "Fone Bluetooth JBL",
  "categoria": "Áudio",
  "preco": 199.9,
  "url": "https://www.amazon.com.br/dp/XXXX/?tag=seu_tag",
  "imagem": "https://exemplo.com/foto.jpg"
}
```

`imagem` é opcional. As URLs precisam ser `http(s)`.

## API HTTP

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Status do serviço |
| `POST` | `/promo` | Publica uma promoção no grupo |
| `GET` | `/jobs` | Lista JSON do scheduler |
| `POST` | `/jobs/:name/run?dryRun=true` | Simula job e retorna relatório |
| `POST` | `/jobs/:name/run?dryRun=false` | Executa e publica job |

`/jobs` exige `x-api-key` quando `API_KEY` definida. Execução → `200` relatório, `404` job inexistente, `409` já rodando, `503` agente desligado. `/health` permanece público.

```bash
curl -X POST http://localhost:3000/promo \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"nome":"Fone JBL","categoria":"Áudio","preco":199.9,"url":"https://amazon.com.br/dp/XXXX"}'
```

Respostas: `201` publicada · `400` dados inválidos (com `details`) · `401` chave inválida · `409` já publicada (use `?force=true` para reenviar) · `502` o Telegram recusou o envio.

## Estrutura

```
src/
├── index.ts               # Composição: carrega config, sobe bot, poller e API
├── agent/                 # Config, curadoria, execução, scheduler e fontes
│   └── sources/           # Amazon, Shopee e Mercado Livre experimental
├── llm/client.ts          # Clientes OpenRouter, OpenAI e Anthropic
├── cli/runJob.ts          # Execução única, dry-run e listagem
├── config/env.ts          # Leitura e validação das variáveis de ambiente
├── domain/promo.ts        # Tipo Promo, validação e chave de deduplicação
├── telegram/
│   ├── bot.ts             # Instância do Telegraf e comandos
│   ├── format.ts          # Formatação HTML da mensagem
│   └── publisher.ts       # Envio da promoção ao grupo
├── promos/
│   ├── source.ts          # Busca de promoções no backend HTTP
│   ├── poller.ts          # Agendamento e publicação das novas
│   └── sentStore.ts       # Histórico em memória, TTL e arquivo JSON opcional
├── http/app.ts            # API Express (/health, /promo, /jobs)
└── dev/mockBackend.ts     # Backend falso para desenvolvimento
test/                      # Testes (node:test)
docs/agente.md             # Guia do agente
agent.config.example.json  # Configuração de exemplo
```

## Testes

```bash
npm test          # testes unitários e de API
npm run typecheck
```

O CI no GitHub Actions roda typecheck, testes e build a cada push e pull request.

## Limitações conhecidas

- Amazon usa scraping, sujeito a captcha e mudanças de HTML; acordo de associados restringe coleta automatizada. PA-API não implementada.
- Shopee exige acesso aprovado à Affiliate Open API; conta de afiliado isoladamente não garante acesso.
- Mercado Livre experimental pode responder `403`, mesmo com credenciais válidas.
- Preços, disponibilidade e descontos dependem dos dados das lojas; não há verificação de menor preço histórico.
- Histórico em JSON não coordena múltiplos processos. Agente e API/poller usam chaves distintas; armazenamento compartilhado não elimina toda duplicidade entre origens.
- LLM pode falhar ou não selecionar ofertas; falhas de chamada/parsing usam heurística.
