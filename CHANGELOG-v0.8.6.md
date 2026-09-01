# Clara BPO Financeiro v0.8.6

## Lançamentos / Classificação
- Novo comando **Alterar todos os filtrados**.
- A ação respeita período, pesquisa, tipo (receita/despesa), forma de pagamento, status e situação da classificação.
- Permite escolher um único Plano de Contas e aplicar a todos os lançamentos encontrados pelo filtro, inclusive quando houver mais registros do que os exibidos na primeira página.
- Antes de alterar, a Clara informa quantos lançamentos serão afetados.
- Fornecedores encontrados na ação em lote são memorizados para as próximas ocorrências da mesma empresa.

## Reconhecimento de fretes
- Fornecedores e descrições com sinais fortes de frete passam a ser classificados automaticamente em **Fretes e entregas** quando essa conta existe no Plano de Contas.
- Inclui termos como SuperFretes, Melhor Envio, Correios, Jadlog, Loggi, transportadora e frete.
- Pendências existentes com esses termos são corrigidas na inicialização da v0.8.6, sem sobrescrever classificações já confirmadas manualmente.
