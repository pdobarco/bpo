# Clara v0.8.5

Patch de reset da Fonte de Dados.

## Novo

- A tela **Arquivos / Fonte de Dados** passa a ter o botão **Resetar arquivos**.
- O reset remove todos os arquivos importados da empresa e somente os dados gerados por esses arquivos: lançamentos, contas a pagar/receber importadas e vínculos de conciliação relacionados.
- O reset preserva **Plano de Contas, Cadastros, regras de classificação e Configurações**.
- A ação exige confirmação e a digitação de `RESETAR` para reduzir risco de exclusão acidental.

## Objetivo

Permitir reiniciar a base de arquivos de uma empresa e reprocessar a pasta do zero sem precisar excluir manualmente cada documento e sem perder as configurações estruturais da Clara.
