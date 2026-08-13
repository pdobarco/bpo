# Claria BPO — v0.1.0

PWA multiempresa para organizar arquivos financeiros, normalizar extratos/relatórios, classificar lançamentos e preparar conciliação, fluxo de caixa e DRE.

## O que já existe nesta primeira versão

- PWA responsiva, simples e focada em usuário leigo.
- Painel Master com troca de empresa.
- Tela Início com caixa, entradas, saídas, pendências e visão mensal.
- Tela Arquivos com `Escolher pasta` (upload de diretório) e seleção de arquivos.
- Leitura de PDF e Excel/CSV no backend.
- Detecção inicial de layouts: extrato PagBank/PagSeguro, extrato Nubank, fatura Nubank e relatório de vendas PagBank.
- Normalização de lançamentos em uma tabela única.
- Biblioteca compartilhada de classificação + regras específicas por empresa.
- Exemplos globais: CELESC→Energia, CASAN→Água, Google Ads→Marketing, Superfrete→Fretes.
- Tela de lançamentos com filtro e classificação manual.
- Conciliação (estrutura e tela inicial) e DRE resumida.
- PostgreSQL e isolamento por empresa.
- Evita duplicidade por hash do arquivo.
- Originais não são persistidos por padrão.

## Subir no Railway

1. Crie um repositório no GitHub e envie todo este projeto.
2. No Railway, crie um projeto a partir do GitHub.
3. Adicione um serviço PostgreSQL.
4. Configure as variáveis de `.env.example`.
5. O Railway executará o build e iniciará o servidor Express, que também serve o frontend compilado.

### Variáveis mínimas

- `DATABASE_URL`: use a variável disponibilizada pelo PostgreSQL do Railway.
- `JWT_SECRET`: chave longa e aleatória.
- `NODE_ENV=production`
- `APP_NAME=Claria`
- `APP_URL`: URL pública do serviço.

### Variáveis opcionais de IA

- `AI_ENABLED=false` nesta primeira versão.
- `OPENAI_API_KEY` e `OPENAI_MODEL` ficam preparados para a fase de adaptação/classificação por IA.

## Desenvolvimento local

```bash
npm install
npm run install:all
# configure server/.env ou exporte DATABASE_URL
npm run dev
```

O frontend usa `http://localhost:5173` e encaminha `/api` para `http://localhost:3000`.

## Estrutura de pasta recomendada ao cliente

```text
Claria Dados/
├── Encante Natural/
│   ├── Bancos/
│   ├── Cartoes/
│   ├── Caixa/
│   ├── Vendas/
│   ├── Compras/
│   └── Estoque/
└── Outra Empresa/
    └── ...
```

A subdivisão é opcional: a aplicação também tenta reconhecer o tipo pelo conteúdo.

## Privacidade

Não publique extratos, faturas ou planilhas reais no GitHub. O projeto foi entregue sem dados pessoais dos arquivos usados como referência.
