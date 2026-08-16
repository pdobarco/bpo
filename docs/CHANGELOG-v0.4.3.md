# Changelog — Clara BPO Financeiro v0.4.3

## Importação

- Correção aplicada diretamente à rota real `POST /api/import`.
- Removida qualquer dependência entre upload e competência selecionada na interface.
- O período extraído do documento é apenas metadado e base para exibição/filtros posteriores.
- Arquivos de revisão/erro são persistidos em `source_files`, evitando o cenário “4 arquivos precisam de revisão” + “0 arquivos encontrados”.
- Adicionado retorno detalhado por arquivo na resposta do upload.
- Adicionado endpoint `GET /api/source-files` para listar todos os arquivos da empresa.

## PDFs bancários

- Extração passou a usar `pdfjs-dist` com reconstrução de linhas por coordenadas.
- Parser PagBank Extrato: ignora `Saldo do dia` e importa as movimentações reais.
- Parser PagBank Vendas: lê as 16 vendas do relatório de referência, incluindo bruto/taxa/líquido.
- Parser Nubank Extrato: lê as movimentações e confere totais de entradas/saídas.
- Parser Nubank Fatura: lê compras em linhas de cartão e não importa o pagamento da fatura como nova despesa.

## Contabilidade

- Aplicação e resgate de CDB são tratados como transferência/investimento, sem impacto na DRE.

## Interface

- Cabeçalho branco em toda a largura do topo da sidebar, acima de `Resumo`, conforme referência aprovada do AprovaAI.
- Logo oficial preservada sem redesenho.
- Versão `v0.4.3` exibida no rodapé do menu lateral.
- Central de Arquivos deixou de exibir “neste período”; lista todos os uploads da empresa.
