# Claria BPO — v0.1.3

PWA multiempresa para organizar arquivos financeiros, aprender classificações e formar caixa, conciliação e DRE sem exigir conhecimento contábil do usuário.

## Correção crítica da v0.1.3

Esta versão corrige a migração do PostgreSQL quando o banco já vinha das versões 0.1.0/0.1.1.

Na v0.1.2, o `initDb()` tentava criar índices que dependiam das colunas novas `counterparty_document` e `account_id` **antes** de executar os `ALTER TABLE` que adicionavam essas colunas ao banco antigo. Isso fazia o PostgreSQL abortar a inicialização com erros como:

- `column "counterparty_document" does not exist`
- `relation "chart_accounts" does not exist`

A v0.1.3 passa a migrar em ordem segura:

1. cria/garante as tabelas-base;
2. cria `chart_accounts`;
3. adiciona as novas colunas às tabelas antigas;
4. cria memória global e contas próprias;
5. só então cria os índices;
6. registra `schema_version=0.1.3`.

**Não é necessário apagar o PostgreSQL nem perder os dados já importados.** Basta fazer o deploy desta versão sobre o banco atual.

## O que permanece da v0.1.2

### Plano de Contas configurável
- **Configurações → Plano de contas**.
- Criar e editar contas, grupos e códigos.
- Tipos: Receita, Dedução, Custo, Despesa, Financeiro, Transferência e Sócios/Patrimônio.
- Definir em qual linha da DRE a conta entra.
- Contas em **Fora da DRE** continuam no fluxo bancário, sem alterar faturamento ou resultado.
- Novas contas entram imediatamente nas opções de classificação e nas categorias disponíveis para a Luna.

### Base Excel de fornecedores ensina o Claria
- Excel/CSV com `Fornecedor + Classificação/Plano de contas` é identificado automaticamente.
- CNPJ/CPF é priorizado quando disponível.
- A classificação é salva no PostgreSQL.
- Fornecedores empresariais podem alimentar a biblioteca compartilhada.
- Pessoas físicas permanecem na memória específica da empresa.

### Biblioteca compartilhada
- Regras específicas da empresa têm prioridade.
- Depois vem a biblioteca global.
- Regras globais aumentam confiança conforme recebem confirmações de empresas diferentes.

### Transferências entre contas próprias
- **Configurações → Contas da empresa**.
- Cadastro de Nubank, PagBank, Inter e outras contas usadas pela empresa.
- Transferências próprias são classificadas como **Fora da DRE**.

### Luna econômica
- Envia apenas favorecidos de saída ainda desconhecidos.
- Processamento em lote.
- Categorias vêm do Plano de Contas da empresa.
- A sugestão só vira memória depois da confirmação do usuário.

## Diagnóstico no Railway

Depois do deploy, abra:

`https://SEU-APP.up.railway.app/api/health`

A resposta esperada é semelhante a:

```json
{
  "ok": true,
  "version": "0.1.3",
  "database": "ok",
  "schema": "0.1.3"
}
```

## Subir no Railway

1. Substitua os arquivos do repositório pelos desta versão e faça commit/push.
2. Não recrie o PostgreSQL.
3. O Railway fará novo deploy automaticamente.
4. Confira `/api/health`.
5. Reabra o Claria e teste Plano de Contas, Arquivos e Ensinar o Claria.

O `DATABASE_URL` deve continuar apontando para o PostgreSQL atual. Não defina `PORT`: o Railway fornece essa variável.

## Privacidade

Não publique extratos, planilhas ou chaves reais no GitHub. Os arquivos originais não são persistidos por padrão (`STORE_ORIGINAL_FILES=false`). A biblioteca compartilhada guarda conhecimento de classificação, e não os valores financeiros de outras empresas.
