# Claria v0.3.4 — correção do build React 19 / TypeScript

Esta versão corrige os erros de tipagem que impediam o frontend da v0.3.3 de concluir o build no Railway.

## Correções

- `useRef` dos inputs de upload agora é tipado explicitamente como `HTMLInputElement` e inicializado com `null`, conforme os tipos do React 19.
- A navegação lateral agora possui tuplas tipadas (`id`, componente de ícone, rótulo), evitando a inferência incorreta de uma união entre `string` e componente Lucide.
- O estado de linha expandida em “Todos os lançamentos” passou a ser explicitamente `string | null`.
- Mantém todas as correções funcionais da v0.2.1 e toda a base moderna da v0.3.x.

## Banco de dados

Nenhuma migration nova. O schema do PostgreSQL continua em `0.3.0`.

Não apague nem recrie o banco existente.
