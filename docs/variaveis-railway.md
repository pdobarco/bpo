# Variáveis do Railway

| Variável | Obrigatória | Exemplo/função |
|---|---|---|
| `DATABASE_URL` | Sim | conexão PostgreSQL do próprio Railway |
| `JWT_SECRET` | Sim | segredo longo; preparado para autenticação v0.2 |
| `NODE_ENV` | Sim | `production` |
| `APP_NAME` | Não | `Claria` |
| `APP_URL` | Recomendada | URL pública do serviço |
| `MAX_UPLOAD_MB` | Não | `20` |
| `STORE_ORIGINAL_FILES` | Não | `false` |
| `AI_ENABLED` | Não | `false` |
| `OPENAI_API_KEY` | Só quando IA ativar | chave da API |
| `OPENAI_MODEL` | Só quando IA ativar | modelo escolhido no momento da integração |
| `PORT` | Não configurar | Railway injeta automaticamente |

## Serviços

- 1 serviço Web para este repositório.
- 1 PostgreSQL no mesmo projeto Railway.

A v0.1 funciona sem IA. Classificação conhecida ocorre por regras locais/globais; itens desconhecidos ficam como `A classificar` para revisão.
