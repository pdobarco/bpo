# Claria BPO — v0.1.2

PWA multiempresa para organizar arquivos financeiros, aprender classificações e formar caixa, conciliação e DRE sem exigir conhecimento contábil do usuário.

## O que entrou na v0.1.2

### Plano de Contas configurável
- Nova tela **Configurações → Plano de contas**.
- Criar e editar contas, grupos e códigos.
- Definir o tipo da conta: Receita, Dedução, Custo, Despesa, Financeiro, Transferência ou Sócios/Patrimônio.
- Definir onde cada conta entra na DRE.
- Contas marcadas como **Fora da DRE** continuam no fluxo bancário, mas não alteram faturamento ou resultado.
- Uma nova conta criada fica imediatamente disponível na classificação de lançamentos e na Luna.
- A DRE da tela Gestão agora é construída dinamicamente a partir do Plano de Contas.

### Base Excel de fornecedores ensina o Claria
- Arquivos Excel/CSV com colunas equivalentes a **Fornecedor + Classificação/Plano de contas** são identificados automaticamente.
- CNPJ/CPF é usado quando disponível.
- A classificação é salva no PostgreSQL como memória da empresa.
- Fornecedores empresariais podem alimentar a biblioteca global compartilhada do Claria.
- Pessoas físicas continuam restritas à empresa.
- Se a classificação do Excel ainda não existir no Plano de Contas, o Claria cria a conta e ela pode ser ajustada depois em Configurações.

### Biblioteca compartilhada
- Classificações de fornecedores de saída podem ser reaproveitadas por outros clientes.
- Uma regra global nova começa como **sugestão**, não como certeza.
- Confirmações independentes de outras empresas aumentam a confiança da regra.
- Regras específicas da empresa sempre têm prioridade sobre a biblioteca global.

### Transferências entre contas próprias
- Nova tela **Configurações → Contas da empresa** para cadastrar Nubank, PagBank, Inter e outras contas próprias.
- O Claria usa nome, CNPJ/CPF, banco, agência/conta e aliases para reconhecer transferências internas.
- `Transferência entre contas próprias` fica no Plano de Contas como **Fora da DRE**.

### Luna econômica
- A Luna recebe apenas favorecidos de saída ainda desconhecidos.
- Os nomes são enviados em lote.
- As categorias permitidas vêm do Plano de Contas ativo da própria empresa.
- Sugestões da IA continuam exigindo confirmação antes de virarem memória.

## Fluxo da classificação

1. Regra já ensinada pela empresa.
2. Reconhecimento de transferência entre contas próprias.
3. Biblioteca global compartilhada.
4. Entrada recebida desconhecida → sugestão `Receita de vendas`.
5. Saída desconhecida → sugestão da Luna, se habilitada.
6. Usuário confirma uma vez.
7. O Claria salva no SQL e reaplica no histórico/futuro.

## Base de fornecedores aceita

O nome das colunas pode variar. O detector procura equivalentes de:

- `Fornecedor`, `Razão Social`, `Favorecido`, `Nome`
- `CNPJ`, `CPF/CNPJ`, `Documento`
- `Classificação`, `Plano de contas`, `Categoria`, `Conta`

A base pode ficar **na mesma pasta da empresa** junto com extratos e demais relatórios.

## Subir no Railway

1. Envie todo este projeto para o GitHub.
2. Crie o serviço no Railway a partir do repositório.
3. Adicione PostgreSQL ao mesmo projeto.
4. Configure as variáveis em `docs/variaveis-railway.md`.
5. Faça o deploy.

O `DATABASE_URL` deve apontar para o PostgreSQL do Railway. Não configure `PORT`: o Railway fornece essa variável automaticamente.

## Desenvolvimento local

```bash
npm install
npm run install:all
npm run dev
```

## Privacidade

Não publique extratos, planilhas ou chaves reais no GitHub. Os arquivos originais não são persistidos por padrão (`STORE_ORIGINAL_FILES=false`). A biblioteca compartilhada guarda conhecimento de classificação de fornecedores, não valores financeiros ou movimentos de outras empresas.
