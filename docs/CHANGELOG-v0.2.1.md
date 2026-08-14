# Claria v0.2.1 — Changelog

## Lançamentos

- Corrigido o carregamento de `Todos os lançamentos`.
- A aba faz nova consulta ao ser aberta e ao mudar período, filtros ou ordenação.
- Erros de consulta são exibidos explicitamente e não são convertidos em lista vazia.
- Adicionado alerta de inconsistência quando a DRE possui valores e a consulta de lançamentos retorna zero.
- A competência efetiva é `competence_at`; quando vazia, usa `occurred_at::date`.
- Corrigida a exibição de datas que apareciam como `Invalid Date`.
- Adicionado botão `Editar lançamento`.
- Edição permite alterar Data de competência e Plano de Contas após confirmação.
- Opção de usar o novo Plano de Contas também como regra para próximos lançamentos do mesmo nome.
- Edições são gravadas em `audit_log`.
- A API impede edição em período fechado.
- Rodapé da tabela mostra quantidade, total de entradas e total de saídas.

## Ordenação

Cabeçalhos clicáveis com alternância crescente/decrescente:

- Competência
- Descrição
- Forma
- Plano de contas
- Status
- Valor

## DRE

- Valores foram aproximados dos títulos, reduzindo o espaço horizontal em monitores largos.
- Alteração de competência ou Plano de Contas reflete na DRE após salvar.

## Banco / Migração

- Schema atualizado para `0.2.1`.
- Lançamentos legados com competência nula recebem `occurred_at::date`.
- Formas de pagamento conhecidas recebem rótulos padronizados.
- O PostgreSQL existente é preservado.
