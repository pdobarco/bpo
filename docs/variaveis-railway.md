# Variáveis do Railway — Claria v0.1.2

Cole estas variáveis no **RAW Editor** do serviço Web. Ajuste `APP_URL`, `DATABASE_URL` e a chave da OpenAI.

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=Claria_2026_Q7m9K2xV8pR4nT6wY3aF5hJ1sD0cL9zB7eN2uM6
APP_NAME=Claria
APP_URL=https://SEU-APP.up.railway.app

AI_ENABLED=true
OPENAI_API_KEY=COLE_SUA_CHAVE_AQUI
OPENAI_MODEL=gpt-5.6-luna
AI_MAX_BATCH=40
AI_MIN_CONFIDENCE=60

MAX_UPLOAD_MB=25
STORE_ORIGINAL_FILES=false
```

> Se o serviço PostgreSQL não se chamar `Postgres`, troque o nome dentro de `${{Postgres.DATABASE_URL}}` pelo nome real do serviço no Railway.

| Variável | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL do Claria |
| `JWT_SECRET` | preparada para autenticação multiusuário |
| `NODE_ENV` | `production` no Railway |
| `APP_NAME` | nome do app |
| `APP_URL` | URL pública do serviço |
| `AI_ENABLED` | habilita sugestões da Luna |
| `OPENAI_API_KEY` | chave da OpenAI, somente no Railway |
| `OPENAI_MODEL` | `gpt-5.6-luna` |
| `AI_MAX_BATCH` | máximo de nomes enviados à Luna por chamada |
| `AI_MIN_CONFIDENCE` | reservado para políticas de automação futuras; nesta versão IA sempre pede confirmação |
| `MAX_UPLOAD_MB` | limite por arquivo |
| `STORE_ORIGINAL_FILES` | deve permanecer `false` neste estágio |
| `PORT` | **não configure**; Railway injeta automaticamente |

## Como a Luna economiza tokens

- Não recebe cada movimentação individual.
- Recebe somente entidades de **saída ainda desconhecidas**.
- Os lançamentos são agrupados por nome antes da chamada.
- No máximo `AI_MAX_BATCH` nomes vão em cada chamada.
- Depois que o usuário confirma o nome, a regra fica salva e esse nome não volta para a Luna.
