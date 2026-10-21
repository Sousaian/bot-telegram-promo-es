# Bot Telegram de Promoções

Bot do Telegram em TypeScript que publica promoções (com link de afiliado) em um grupo ou canal. As promoções chegam de duas formas:

- **Polling:** o bot consulta periodicamente um backend que devolve uma lista de promoções e publica só as novas.
- **API HTTP:** qualquer serviço pode mandar um `POST /promo` para publicar na hora.

## Funcionalidades

- Mensagens formatadas em HTML, com preço em reais (`R$ 1.299,90`), categoria, link e foto opcional
- **Deduplicação:** a mesma oferta (mesmo link e mesmo preço) não é publicada duas vezes, e uma queda de preço gera uma nova publicação
- Validação dos dados recebidos (do backend e da API), descartando itens inválidos com log
- API protegida por chave opcional (`x-api-key`) e endpoint `/health`
- Comandos do bot: `/start`, `/help` e `/chatid` (mostra o ID do grupo para configurar o `.env`)
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
| `API_KEY` | não | | Se definida, o `POST /promo` exige o header `x-api-key` |

> Para descobrir o `GROUP_ID`, adicione o bot ao grupo e mande `/chatid`. Para publicar em um canal, o bot precisa ser administrador.

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
├── config/env.ts          # Leitura e validação das variáveis de ambiente
├── domain/promo.ts        # Tipo Promo, validação e chave de deduplicação
├── telegram/
│   ├── bot.ts             # Instância do Telegraf e comandos
│   ├── format.ts          # Formatação HTML da mensagem
│   └── publisher.ts       # Envio da promoção ao grupo
├── promos/
│   ├── source.ts          # Busca de promoções no backend HTTP
│   ├── poller.ts          # Agendamento e publicação das novas
│   └── sentStore.ts       # Registro das promoções já enviadas (memória)
├── http/app.ts            # API Express (/health, /promo)
└── dev/mockBackend.ts     # Backend falso para desenvolvimento
test/                      # Testes (node:test)
```

## Testes

```bash
npm test          # testes unitários e de API
npm run typecheck
```

O CI no GitHub Actions roda typecheck, testes e build a cada push e pull request.

## Limitações conhecidas

- O registro de promoções enviadas fica **em memória**. Ao reiniciar o processo, o bot pode republicar ofertas que o backend ainda devolve. Para persistir, troque o `SentStore` por uma implementação com arquivo, Redis ou banco.
- Ainda não há integração real com a Amazon (PA-API) nem com IA para gerar os textos. O backend é responsável por fornecer as promoções.
