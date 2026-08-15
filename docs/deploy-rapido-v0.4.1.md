# Deploy rápido — Clara BPO v0.4.1

1. Faça commit/push de todos os arquivos da v0.4.1.
2. Não recrie o PostgreSQL.
3. Não altere a `DATABASE_URL` real do Railway.
4. Mantenha `MASTER_EMAIL`, `MASTER_INITIAL_PASSWORD`, `SESSION_DAYS` e as variáveis de IA já configuradas.
5. Aguarde build/deploy.
6. Abra `/api/health`.

Esperado:

```json
{"ok":true,"version":"0.4.1","database":"ok","schema":"0.4.0"}
```
