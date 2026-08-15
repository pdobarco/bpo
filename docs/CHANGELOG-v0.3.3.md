# Claria v0.3.3 — correção definitiva do build TypeScript

## Problema observado na v0.3.2

O Railway continuou falhando em `server/src/index.ts` com `TS2769` na construção do `Map` que guardava schemas Zod diferentes.

A tentativa anterior tipava a variável como `Map<string, any>`, mas isso não impedia o TypeScript de resolver o overload do construtor `new Map([...])` a partir do primeiro par do array. Como os schemas seguintes tinham formatos diferentes, o compilador ainda tentava tratá-los como o mesmo `ZodObject`.

## Correção da v0.3.3

- removido o construtor heterogêneo `new Map([...])` para os schemas de body;
- o registro de schemas agora é um `Record<string, any>` simples;
- a consulta do schema usa a chave `METHOD + rota` diretamente;
- nenhuma regra financeira, tabela ou migration foi alterada;
- nenhuma mudança no PostgreSQL é necessária;
- versão da aplicação atualizada para `0.3.3`;
- `schema_version` permanece `0.3.0`.

## Validação realizada

- todos os arquivos `.ts`/`.tsx` foram analisados pelo compilador TypeScript em modo de transpile e não apresentaram erro de sintaxe;
- JSONs do projeto foram validados;
- o ZIP final foi testado com `unzip -t`;
- não foi possível executar um `npm install` completo no ambiente de geração por indisponibilidade/timeout do registry; portanto o Railway continua sendo a validação final com as dependências reais.
