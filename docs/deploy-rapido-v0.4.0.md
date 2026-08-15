# Deploy rápido — Clara BPO v0.4.0

1. Mantenha o PostgreSQL existente e a mesma `DATABASE_URL`.
2. Nas Variables do serviço web no Railway, adicione:

```env
MASTER_EMAIL=thomas.muller@bateriasmoura.com
MASTER_INITIAL_PASSWORD=DEFINA_AQUI_UMA_SENHA_FORTE
SESSION_DAYS=30
```

3. Mantenha as variáveis de IA/upload já existentes.
4. Substitua os arquivos do repositório por esta versão e faça commit/push.
5. Após o deploy, teste `/api/health`.
6. Entre em `/` com o e-mail master e a senha definida em `MASTER_INITIAL_PASSWORD`.
7. Teste `/demonstracao` em uma janela anônima; ela deve abrir sem login e sem escrever no banco.

> Não apague o PostgreSQL e não recrie o serviço de banco.
