# Validação local — Clara v0.6.0

- Arquivos TypeScript/TSX de implementação analisados pelo transpiler TypeScript: **14 arquivos, 0 erros de sintaxe**.
- Migration `0003_operational_v060.sql` incluída e idempotente (`IF NOT EXISTS`).
- Modelo `docs/modelo-contas-a-pagar-clara.xlsx` validado como arquivo XLSX íntegro.
- Versão conferida em root/client/server, UI, `/api/health` e `schema_meta`: **0.6.0**.

## Limitação do ambiente de validação
O `npm install`/`npm build` completo não pôde ser executado neste ambiente porque o registry do npm não estava acessível (`EAI_AGAIN`). O build do Railway deve, portanto, ser tratado como a validação completa de dependências/runtime antes do uso em produção.
