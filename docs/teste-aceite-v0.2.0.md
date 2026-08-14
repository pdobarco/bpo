# Checklist de aceite — Claria v0.2.0

Após o deploy no Railway, testar nesta ordem.

## 1. Migração
- abrir `/api/health`;
- confirmar `version=0.2.0`, `database=ok`, `schema=0.2.0`;
- não apagar o PostgreSQL anterior.

## 2. Plano de Contas
- abrir Configurações → Plano de contas;
- confirmar que existe `3.03 · Embalagens`;
- criar uma conta de teste e validar que ela aparece no seletor de classificação.

## 3. Arquivos
- importar extrato Nubank;
- importar fatura Nubank;
- importar extrato/relatório PagBank;
- conferir status individual de cada arquivo;
- verificar se uma fonte já usada passa a aparecer como fonte esperada mensal.

## 4. Nubank
- confirmar que `Transferência recebida ... NU PAGAMENTOS` permanece positiva;
- confirmar que `Pagamento de fatura` fica fora da DRE;
- confirmar que compras da fatura aparecem individualmente como `Cartão de crédito`.

## 5. PagBank
- confirmar `Vendas - Disponível` como Receita de vendas;
- quando houver relatório detalhado de vendas e extrato do mesmo período, validar que a DRE não soma os dois como receita;
- confirmar taxa de cartão como `Taxas bancárias e financeiras`.

## 6. Ensinar o Claria
- classificar uma pessoa/fornecedor uma única vez;
- confirmar que os demais lançamentos abertos do mesmo nome + direção recebem a regra;
- confirmar que `Transferência entre contas próprias` está disponível.

## 7. Todos os lançamentos
- filtrar o mês;
- buscar por nome;
- validar competência, vencimento, pagamento, forma, plano, status e valor;
- abrir um lançamento e conferir arquivo de origem e tratamento DRE/caixa.

## 8. Conciliação
- confirmar que o número de pendências é igual ao de Lançamentos;
- verificar fontes faltantes/revisão;
- verificar vínculos de venda ↔ recebimento quando existirem.

## 9. Gestão
- validar DRE do mês;
- validar comparação mês a mês;
- clicar em uma linha da DRE e conferir os lançamentos que a formam;
- validar recebimentos/pagamentos por forma.

## 10. Fechamento
- resolver todas as pendências;
- fechar o mês;
- alterar posteriormente uma regra de classificação e confirmar que a DRE fechada continua no snapshot;
- reabrir o mês quando necessário.
