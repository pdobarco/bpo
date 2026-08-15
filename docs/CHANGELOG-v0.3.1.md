# Claria v0.3.1 — Correção de build no Railway

## Motivo

O primeiro deploy da v0.3.0 parou durante `npm --prefix server install` com `ERESOLVE`.
O SDK `openai@5.23.2`, resolvido a partir de `^5.19.1`, declarava compatibilidade opcional com Zod 3, enquanto o novo backend do Claria usa Zod 4.

## Correções

- SDK oficial OpenAI atualizado para `openai@7.4.0`.
- Zod 4 mantido; não houve downgrade da nova arquitetura.
- `install:all` passa a usar `--include=dev` no client e no server para garantir TypeScript, Vite e demais ferramentas de compilação no ambiente de build do Railway.
- Não foi usado `--force` nem `--legacy-peer-deps`.
- Versão visível/API atualizada para `0.3.1`.

## Banco de dados

Esta versão **não altera o schema do PostgreSQL**. Portanto:

- mantenha o PostgreSQL atual;
- mantenha a mesma `DATABASE_URL`;
- não apague tabelas nem dados;
- o `schema_version` esperado continua `0.3.0` porque não existe mudança estrutural de banco nesta correção.

## Resultado esperado

O build deve ultrapassar a etapa que anteriormente falhava com:

```text
ERESOLVE could not resolve
openai@5.23.2
peerOptional zod@^3.23.8
Found: zod@4.x
```

Depois do deploy, `/api/health` deve informar `version: 0.3.1`, `database: ok` e `schema: 0.3.0`.
