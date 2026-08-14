# Base Excel de fornecedores — Claria v0.2.0

A base pode ficar na mesma pasta dos demais arquivos da empresa.

## Colunas mínimas

O Claria tenta reconhecer automaticamente nomes equivalentes a:

| Informação | Exemplos aceitos |
|---|---|
| Fornecedor | Fornecedor, Razão Social, Favorecido, Nome |
| Documento | CNPJ, CPF/CNPJ, Documento, CPF |
| Classificação | Classificação, Plano de contas, Categoria, Conta |
| Direção (opcional) | Direção, Tipo movimento, Entrada/Saída |

Fornecedor + Classificação são obrigatórios para o arquivo ser reconhecido como base.

## Aprendizado

1. O arquivo é lido.
2. O nome do fornecedor é normalizado.
3. O CNPJ/CPF é guardado quando disponível.
4. A classificação é vinculada ao Plano de Contas.
5. A regra é salva no PostgreSQL para a empresa.
6. Se for fornecedor empresarial e a regra for reutilizável, a classificação também pode alimentar a biblioteca global como sugestão.
7. Pessoas físicas não são compartilhadas entre empresas.

## Conta inexistente

Se o Excel trouxer uma classificação que ainda não existe no Plano de Contas, o Claria cria a conta automaticamente. Para saídas, o destino inicial é escolhido por heurística e pode ser revisado em **Configurações → Plano de contas**.
