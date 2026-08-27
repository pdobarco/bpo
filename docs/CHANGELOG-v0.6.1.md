# Clara BPO v0.6.1

## Correções do importador de PDF

### Fatura Nubank: lançamentos repetidos legítimos
- Corrigida a deduplicação dentro do parser.
- A Clara não remove mais duas compras reais apenas porque possuem a mesma data, descrição e valor.
- Deduplicação no parser passa a ocorrer somente quando existe um identificador externo estável.
- O hash do arquivo continua impedindo a importação duplicada do mesmo documento.
- Caso de regressão: fatura Nubank 17/07/2026 possui duas linhas `Superfrete` de R$ 30,68 em 26/06/2026; ambas precisam ser mantidas para o total fechar em R$ 5.519,35.

### Relatório de Vendas PagBank: páginas rotacionadas
- Corrigida reconstrução das linhas do PDF para respeitar a rotação real da página.
- O texto passa a ser convertido para coordenadas do viewport do PDF.js antes do agrupamento por linha.
- Isso corrige relatórios PagBank gravados com `/Rotate 90`, que antes eram reconhecidos como PagBank Vendas mas resultavam em zero lançamentos.

## Sincronização por pasta
- Com os dois formatos acima lidos corretamente, um arquivo válido não deve mais impedir a aplicação da sincronização da pasta.
- A regra de segurança permanece: se um arquivo realmente não puder ser lido, a base anterior é preservada.
