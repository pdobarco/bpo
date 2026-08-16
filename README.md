# Clara BPO Financeiro — patch v0.4.2 import-fix

Pacote de correção para o problema em que PDFs com movimentações eram enviados para revisão/ficavam invisíveis e o upload estava acoplado ao período selecionado na interface.

## Arquivos principais

- `server/src/import/pdf-layout.ts` — extrai PDF preservando ordem visual das colunas;
- `server/src/import/parsers.ts` — detecta e normaliza quatro layouts financeiros conhecidos;
- `server/src/import/process-upload.ts` — contrato de processamento sem mês/competência de UI;
- `client/src/features/files/import-policy.ts` — upload/listagem de arquivos independente do período e invalidação de queries;
- `INTEGRACAO-v0.4.2.md` — pontos exatos a aplicar na base atual;
- `teste-aceite-v0.4.2.md` — checklist de validação.

## Importante

Este ZIP é um **patch de código**, não uma cópia integral do repositório atual. Ele foi produzido porque o source tree v0.4.1 completo não estava disponível no runtime desta conversa. Os módulos foram desenhados para a arquitetura documentada do Clara (React 19 + TanStack Query + Fastify 5 + TypeScript + PostgreSQL/Drizzle) e devem ser integrados à base atual seguindo o guia.
