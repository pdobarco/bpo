# Plano de Contas e DRE — Claria

## Onde configurar

No app: **Configurações → Plano de contas**.

O objetivo é manter a operação simples: o usuário cria uma conta e escolhe onde ela entra na DRE. A partir daí a conta aparece automaticamente nos seletores de classificação e pode ser usada pela Luna.

## Campos

- Código: opcional, ex. `4.10`.
- Nome: ex. `Embalagens`.
- Grupo: organiza a hierarquia.
- Tipo: Receita, Dedução, Custo, Despesa, Financeiro, Transferência, Sócios/Patrimônio ou Grupo.
- Destino na DRE:
  - Receita bruta
  - Deduções da receita
  - Custos / CMV
  - Despesas operacionais
  - Resultado financeiro
  - Outras receitas / despesas
  - Fora da DRE

## Regra importante

`Fora da DRE` mantém o movimento no banco/caixa, mas não altera faturamento ou resultado. Usar, por exemplo, para:

- Transferência entre contas próprias
- Aporte / Empréstimo
- Pagamento de fatura de cartão (quando as compras já foram apropriadas)
- Retirada do sócio

## Integração com classificação

A lista apresentada em **Ensinar o Claria** não é fixa no código: ela é carregada das contas ativas do Plano de Contas da empresa.

Ao criar uma nova conta, ela passa a estar disponível imediatamente para:

- classificação manual;
- regras aprendidas;
- base Excel de fornecedores;
- sugestões da Luna;
- DRE.
