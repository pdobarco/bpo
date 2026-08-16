# Clara BPO Financeiro v0.4.4

## Correções

- Corrige falha PostgreSQL `could not determine data type of parameter $3` durante importação de PDFs.
- O update automático de CNPJ/nome da empresa agora usa casts explícitos (`$2::text`, `$3::text`) e aceita nome ausente sem erro.
- Mantém upload independente da competência selecionada.
- Reforça visual aprovado da sidebar: cabeçalho branco ocupa 100% da largura acima de `Resumo`, sem alterar a logo oficial.
- Exibe `Clara BPO · v0.4.4` na parte inferior da sidebar.
- Endpoint `/api/health` informa `version: 0.4.4`, facilitando confirmar se o deploy correto está ativo.

## Validação recomendada

1. Publicar no Railway.
2. Abrir `/api/health` e confirmar `0.4.4`.
3. Fazer recarregamento forçado do navegador (Ctrl+Shift+R) para evitar cache da PWA.
4. Importar novamente os quatro PDFs de teste.
5. Confirmar que os arquivos aparecem na Central de Arquivos e que os lançamentos são persistidos.
