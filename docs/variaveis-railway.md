# Variáveis do Railway — Claria v0.2.1

Estas são as variáveis **realmente consumidas pelo código da v0.2.1**.

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}

AI_ENABLED=true
OPENAI_API_KEY=SUA_CHAVE_OPENAI
OPENAI_MODEL=gpt-5.6-luna
AI_MAX_BATCH=40
AI_FILE_MAX_CHARS=30000

MAX_UPLOAD_MB=25
```

## Observações

- `PORT`: não crie manualmente; o Railway fornece.
- `DATABASE_URL`: use referência para o PostgreSQL existente do projeto.
- `OPENAI_API_KEY`: somente nas Variables do Railway; nunca no GitHub.
- `AI_MAX_BATCH`: máximo de favorecidos enviados numa chamada de classificação da Luna.
- `AI_FILE_MAX_CHARS`: máximo de texto enviado à Luna quando um PDF falha no parser convencional.
- `MAX_UPLOAD_MB`: limite por arquivo recebido pelo backend.

`JWT_SECRET`, `APP_NAME`, `APP_URL` e `STORE_ORIGINAL_FILES` **não são necessários nesta versão**, pois a v0.2.1 ainda não usa autenticação JWT nem armazenamento do binário original.
