# Clara v0.8.4

Patch de correção de visibilidade de arquivos e lançamentos.

## Correções

- A coluna **Fonte efetivamente usada** deixa de limitar a exibição aos três primeiros arquivos de cada origem. Extratos mensais mais recentes, como agosto, permanecem visíveis na própria origem.
- A visão **Todos os lançamentos** passa a abrir sem o filtro oculto de `Pendentes de classificação`, exibindo também lançamentos já classificados automaticamente.
- O retorno de arquivo duplicado agora informa em qual origem o arquivo já foi importado e quantos registros foram extraídos.
- Se a importação anterior do mesmo arquivo ficou sem registros/para revisão, a mensagem orienta abrir o diagnóstico e reprocessar, em vez de apenas informar genericamente `Arquivo já importado`.
- Se o mesmo conteúdo já foi importado em outro tipo de fonte, a Clara informa qual foi o tipo anterior e evita uma troca silenciosa de função.

## Objetivo

Evitar a falsa impressão de que um extrato mensal não foi importado quando ele está apenas oculto pela interface ou quando seus lançamentos foram automaticamente classificados.
