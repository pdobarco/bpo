# Variáveis do Railway — Clara BPO v0.4.1

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}

MASTER_EMAIL=thomas.muller@bateriasmoura.com
MASTER_INITIAL_PASSWORD=DEFINA_UMA_SENHA_FORTE
SESSION_DAYS=30

AI_ENABLED=true
OPENAI_API_KEY=SUA_CHAVE_OPENAI
OPENAI_MODEL=gpt-5.6-luna
AI_MAX_BATCH=40
AI_FILE_MAX_CHARS=30000
MAX_UPLOAD_MB=25
```

## Importante

- `MASTER_INITIAL_PASSWORD` é usada somente para ativar o usuário master caso ele ainda não tenha senha no banco.
- Depois que a senha já estiver gravada, reiniciar o serviço não troca a senha.
- `JWT_SECRET` não é usado nesta versão. As sessões usam tokens aleatórios, guardados somente como hash no PostgreSQL.
- `PORT` é fornecida pelo Railway.
- Mantenha o PostgreSQL atual e a mesma `DATABASE_URL`.
