# Clara v0.8.4

Patch de correção de visibilidade de arquivos e lançamentos.

## Correções

- A coluna **Fonte efetivamente usada** deixa de limitar a exibição aos três primeiros arquivos de cada origem. Extratos mensais mais recentes, como agosto, permanecem visíveis na própria origem.
- A visão **Todos os lançamentos** passa a abrir sem o filtro oculto de `Pendentes de classificação`, exibindo também lançamentos já classificados automaticamente.
- Ao reenviar um arquivo já conhecido, a Clara não confia apenas no `record_count`: ela verifica se existem lançamentos efetivamente vinculados àquele arquivo. Se não existirem, a importação anterior é descartada e o arquivo é processado novamente.
- Se o mesmo arquivo foi apenas renomeado na pasta, o nome salvo em **Arquivos** é atualizado para o nome atual, mantendo os lançamentos já importados.
- O retorno de arquivo duplicado informa em qual origem o arquivo já foi importado e quantos registros foram extraídos.
- Se o mesmo conteúdo já foi importado em outro tipo de fonte, a Clara informa qual foi o tipo anterior e evita uma troca silenciosa de função.

## Objetivo

Evitar a falsa impressão de que um extrato mensal não foi importado quando ele está oculto pela interface, quando seus lançamentos foram automaticamente classificados ou quando existia uma importação órfã sem lançamentos vinculados.
