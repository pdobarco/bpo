# Claria BPO — v0.1.1

PWA multiempresa para organizar arquivos financeiros, normalizar extratos/relatórios, classificar lançamentos uma única vez por entidade e preparar conciliação, fluxo de caixa e DRE.

## Melhorias desta versão

- Corrige o parser Nubank que podia transformar uma `Transferência Recebida` em saída quando a descrição continha `NU PAGAMENTOS`.
- Migração automática corrige registros antigos afetados por esse bug ao iniciar a nova versão.
- Extrai e normaliza o nome da pessoa/empresa de cada movimentação.
- Nova tela **Ensinar o Claria**: agrupa pendências por `nome + direção`, em vez de exigir classificação lançamento a lançamento.
- Ao confirmar uma categoria, o Claria cria uma regra da empresa e reaplica em todo o histórico daquele nome e direção.
- Entradas via PIX/transferência recebida desconhecida recebem sugestão inicial `Receita de vendas`.
- Transferências contendo nome/CNPJ da própria empresa podem ser reconhecidas como `Transferência entre contas`.
- Botão em lote para confirmar vários nomes prováveis de clientes como `Receita de vendas`.
- GPT-5.6 Luna integrado para sugerir **somente nomes de saídas ainda desconhecidos**, em lote e de forma conservadora.
- O setor e a atividade da empresa são enviados como contexto para a Luna.
- Sugestões da Luna **não viram regra automaticamente**: somente após confirmação do usuário.
- Biblioteca global continua compartilhando classificações de empresas conhecidas como CELESC, CASAN, Google Ads, Superfrete etc.
- Pessoas físicas e regras específicas continuam isoladas por empresa.

## Filosofia da classificação

1. Regra já ensinada pela própria empresa.
2. Biblioteca global de fornecedores conhecidos.
3. Reconhecimento de transferência entre contas próprias.
4. Entrada positiva recebida: sugestão de `Receita de vendas`.
5. Saída desconhecida: Luna sugere em lote, se ativada.
6. Usuário confirma uma única vez e o sistema aprende.

A regra aprendida é sempre salva como **entidade + direção**. Assim, uma pessoa pode ser `Receita de vendas` quando aparece como entrada e ter outra classificação quando aparece como saída.

## Subir no Railway

1. Envie todo este projeto para o GitHub.
2. No Railway, crie o serviço a partir do repositório.
3. Adicione PostgreSQL no mesmo projeto.
4. Configure as variáveis descritas em `docs/variaveis-railway.md`.
5. Faça o deploy.

O `DATABASE_URL` deve apontar para o PostgreSQL do Railway. Não defina `PORT`: o Railway injeta automaticamente.

## Desenvolvimento local

```bash
npm install
npm run install:all
npm run dev
```

## Privacidade

Não publique extratos, faturas, planilhas ou chaves reais no GitHub. Os arquivos financeiros originais não são persistidos por padrão (`STORE_ORIGINAL_FILES=false`). A OpenAI recebe somente os nomes/descritivos mínimos dos favorecidos que ainda precisam de sugestão quando a Luna está habilitada.
