# Claria v0.1.1 — Changelog

## Classificação
- agrupamento por nome + direção;
- memória por empresa;
- classificação em lote de entradas prováveis como receita;
- GPT-5.6 Luna para sugestões de saídas desconhecidas;
- setor/atividade da empresa como contexto da IA;
- sugestões da IA sempre exigem confirmação antes de virar regra.

## Parser Nubank
- `Transferência Recebida` agora tem prioridade sobre palavras existentes no nome do banco;
- `NU PAGAMENTOS` não é mais interpretado como `Pagamento` de saída;
- migração corrige automaticamente lançamentos antigos afetados pelo bug.

## Gestão
- transferências entre contas deixam de compor faturamento/resultado operacional quando classificadas corretamente.
