# Claria v0.2.0 — Changelog

## Fluxo
- Fluxo explícito `Arquivos → Lançamentos → Conciliação → Gestão`.
- Seletor global de mês.
- Semáforo de fechamento e indicador de qualidade dos dados.

## Arquivos
- Status de processamento com motivo.
- Fontes esperadas mensais.
- Validação de totais de controle para extratos compatíveis.
- PDF sem registros pode ser adaptado com GPT-5.6 Luna quando IA está habilitada.
- Arquivo em período fechado não é reimportado automaticamente.

## Lançamentos
- Nova consulta `Todos os lançamentos`.
- Novos campos: competência, vencimento, pagamento, forma de pagamento, status financeiro, papel contábil, impacto em DRE e impacto em caixa.
- Rastreabilidade até arquivo de origem.

## PagBank
- Entradas descritas como `Vendas - Disponível` são classificadas automaticamente como Receita de vendas.
- Se existe relatório detalhado de vendas para o mesmo período, o extrato passa a representar apenas recebimento de caixa e não duplica receita.
- Taxas do relatório de vendas viram lançamentos negativos de `Taxas bancárias e financeiras` na DRE.

## Nubank cartão
- Compras da fatura entram individualmente como despesas por competência e forma `Cartão de crédito`.
- `Pagamento de fatura` passa a `Liquidação de cartão de crédito`, fora da DRE e com impacto somente em caixa.

## Plano de Contas
- `Embalagens` adicionada ao plano padrão em `Custos / CMV`.
- Plano continua totalmente configurável e integrado à classificação e DRE.

## Conciliação
- Pendências são as mesmas da aba Lançamentos.
- Fontes faltantes/revisão aparecem na própria Conciliação.
- Primeiro vínculo automático entre evento de venda e recebimento de caixa.

## Gestão
- DRE mensal por competência.
- DRE comparativa de 12 meses.
- Gráfico de receitas com valores.
- Indicadores da DRE são clicáveis e levam aos lançamentos.
- Resumo por forma de pagamento.

## Fechamento e auditoria
- Fechar/reabrir mês.
- Snapshot da DRE no fechamento.
- Aprendizados novos não alteram automaticamente lançamentos de períodos fechados.
- Auditoria de importação, classificação, Plano de Contas e fechamento.
