# Clara BPO Financeiro — v0.4.3

Versão completa baseada no código real do repositório enviado, com correções integradas no fluxo que o Railway executa.

## Principais correções

- upload de arquivos **independente do mês selecionado**;
- parser de PDF migrado para extração por coordenadas com PDF.js, preservando linhas de tabelas bancárias;
- suporte validado para:
  - Nubank — extrato de conta;
  - Nubank — fatura de cartão;
  - PagBank/PagSeguro — extrato de conta;
  - PagBank — relatório de vendas;
- arquivos com erro/revisão agora são persistidos e aparecem na Central de Arquivos;
- Central de Arquivos lista **todos os arquivos da empresa**, sem filtro pelo mês da interface;
- resposta do upload traz diagnóstico por arquivo quando houver erro;
- cabeçalho branco integral no topo da sidebar para a logo oficial da Clara;
- versão visível no rodapé do menu lateral: `v0.4.3`;
- aplicações/resgates de CDB tratados como movimentação financeira fora da DRE.

## Versão

- App: `0.4.3`
- Endpoint de conferência: `GET /api/health`

## Deploy no Railway

1. Substitua o conteúdo do repositório pelos arquivos desta versão.
2. Faça commit/push.
3. O Railway executará `npm run install:all && npm run build`.
4. Confirme em `/api/health` que a versão retornada é `0.4.3`.
5. Execute o checklist em `docs/teste-aceite-v0.4.3.md`.
