# Variáveis do Railway — Claria v0.3.4

A modernização para TypeScript/Fastify/Drizzle **não cria novas variáveis obrigatórias**.

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

- `PORT`: não configurar; o Railway fornece.
- `DATABASE_URL`: manter a referência para o PostgreSQL atual.
- `OPENAI_API_KEY`: somente nas Variables do Railway; nunca no GitHub.
- `OPENAI_MODEL`: mantenha o modelo configurado para a Luna usado no projeto.
- `AI_MAX_BATCH`: limite de favorecidos enviados em uma classificação em lote.
- `AI_FILE_MAX_CHARS`: limite de texto enviado à Luna no fallback de adaptação de PDF.
- `MAX_UPLOAD_MB`: tamanho máximo por arquivo no endpoint de importação.
- Node 24 é solicitado pelo campo `engines` dos `package.json` e pelo `.nvmrc`.
- Drizzle usa a própria `DATABASE_URL`; não existe `DRIZZLE_URL` nem serviço adicional.

`JWT_SECRET`, `APP_NAME`, `APP_URL` e `STORE_ORIGINAL_FILES` continuam não sendo exigidos pela v0.3.4.
