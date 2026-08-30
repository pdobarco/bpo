# Clara BPO Financeiro v0.8.3

## Conciliação de fatura de cartão
- Agrupa os títulos `CREDIT_CARD_INSTALLMENT` pelo arquivo de fatura e pelo mês de vencimento.
- Soma os lançamentos que compõem a fatura do mês.
- Procura uma saída bancária do mesmo valor no mesmo mês de vencimento.
- Faz conciliação automática quando existe um único pagamento compatível com descrição de fatura/cartão.
- Permite confirmação manual quando existe pagamento candidato.
- Ao conciliar, marca todos os títulos da fatura como pagos e registra o pagamento bancário como `Liquidação de cartão de crédito`, sem novo impacto na DRE.
- O pagamento total da fatura deixa de aparecer como despesa sem origem e as compras deixam de aparecer como contas a pagar sem pagamento.

## Ações em lote na conciliação
- Checkbox por movimentação bancária sem origem.
- Ação `Selecionar todos`.
- Classificação em lote no mesmo plano de contas.
- Transferência entre contas em lote.
- Ignorar em lote.
- Para classificação no plano de contas, entradas e saídas não podem ser misturadas na mesma seleção.
- Entradas PIX selecionadas sugerem `Receita de vendas` quando essa conta existe.

## Regras preservadas
- Compra no cartão continua impactando a DRE somente no fato econômico correto.
- Pagamento da fatura impacta caixa, mas não repete a despesa na DRE.
- Parcelas/títulos continuam compondo o fluxo de caixa pelos seus vencimentos.
