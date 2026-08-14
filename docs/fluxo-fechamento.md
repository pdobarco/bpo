# Fluxo de fechamento da v0.2.0

## 1. Arquivos — Recebi tudo?

- importar pasta/arquivos;
- identificar fonte;
- conferir totais quando possível;
- apontar fonte faltante;
- revisar arquivo com diferença;
- adaptar com Luna somente quando o parser normal falhar.

## 2. Lançamentos — Entendi tudo?

- classificar nomes novos uma única vez;
- auditar todos os lançamentos;
- separar competência, vencimento e pagamento;
- distinguir DRE de caixa;
- manter não classificados visíveis.

## 3. Conciliação — Os números batem?

- usar as mesmas pendências de Lançamentos;
- mostrar fontes lidas e faltantes;
- vincular venda a recebimento;
- evitar dupla contabilização;
- manter transferência própria e pagamento de fatura fora da DRE.

## 4. Gestão — O que os números dizem?

- DRE mensal;
- DRE comparativa;
- valores nos gráficos;
- formas de pagamento;
- drill-down até o lançamento e arquivo de origem.

## 5. Fechar período

O fechamento só fica habilitado quando:

- existe dado importado no mês;
- não há fonte esperada faltando;
- não há arquivo marcado para revisão;
- não há classificação pendente.

Ao fechar, a DRE é salva como snapshot e o período fica protegido.
