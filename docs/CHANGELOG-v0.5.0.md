# CHANGELOG — v0.5.0

## Sincronização de pasta
- A seleção de pasta usa `/api/import?mode=sync`.
- Arquivos anteriores são mantidos até a nova carga chegar ao final.
- Hashes antigos coincidentes são temporariamente liberados para permitir reprocessamento.
- Em sucesso, lançamentos e arquivos anteriores são substituídos.
- Em falha crítica/arquivo sem lançamento, a tentativa nova é removida e os hashes anteriores são restaurados.
- `classification_rules` da base anterior não são apagadas ao substituir os arquivos.

## DRE comparativa
- API `/api/dre-comparative` retorna seções e contas com vetor de 12 meses.
- UI mostra o Plano de Contas completo por expansão/recolhimento.

## Precificação
- Nova tabela `pricing_models` criada automaticamente no startup.
- Novas rotas:
  - `GET/POST /api/pricing/models`
  - `PUT/DELETE /api/pricing/models/:id`
  - `GET /api/pricing/template`
  - `POST /api/pricing/import`
  - `POST /api/pricing/export`
  - `POST /api/pricing/market-compare`
- Novo menu `Precificação` acima de `Cadastros`.

## UX
- Aviso em Cadastros > Contas sobre transferências próprias.
- Rodapé exibe `Clara BPO · v0.5.0`.
