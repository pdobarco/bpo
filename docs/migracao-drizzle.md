# Adoção do Drizzle no banco existente

## Regra principal

**Não apague nem recrie o PostgreSQL atual.**

O Claria já tinha tabelas e dados antes da adoção do Drizzle. A v0.3.0 usa uma estratégia conservadora:

1. `initDb()` garante a estrutura histórica com SQL idempotente;
2. `server/src/db/schema.ts` descreve a estrutura em TypeScript;
3. o migrador Drizzle executa `server/drizzle/0000_adopt_claria.sql`;
4. o Drizzle cria seu próprio histórico de migrations no PostgreSQL;
5. o Claria registra `schema_version=0.3.0`.

## No Railway

Não crie nenhum novo serviço. A aplicação usa:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

O Drizzle roda dentro do serviço web do Claria.

## Novas alterações de banco

Antes de uma mudança futura:

1. atualizar `server/src/db/schema.ts`;
2. gerar/revisar a migration em ambiente de desenvolvimento ou staging;
3. nunca aplicar `push` diretamente no banco de produção sem revisar o SQL;
4. incluir a migration no GitHub;
5. fazer backup/snapshot do banco antes de mudanças destrutivas;
6. deixar o deploy aplicar a migration versionada.

Comandos disponíveis no diretório `server`:

```bash
npm run db:pull
npm run db:generate
npm run db:migrate
```

### Observação sobre o primeiro baseline

Como não há acesso à `DATABASE_URL` real dentro do pacote entregue, o schema foi construído a partir da estrutura que o próprio Claria já inicializa. Antes da primeira mudança **estrutural** feita com geração automática do Drizzle, recomenda-se executar `db:pull` contra uma cópia/staging do banco real e comparar com `src/db/schema.ts`. O primeiro deploy da v0.3.0 não depende disso para preservar os dados atuais.
