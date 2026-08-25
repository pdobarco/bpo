# Clara BPO Financeiro — v0.5.0

Versão consolidada com sincronização por pasta, DRE comparativa expansível e novo módulo de Precificação.

## Principais mudanças

### Arquivos
- **Escolher pasta = sincronizar base**: a pasta selecionada passa a representar a fotografia atual dos documentos.
- Em uma sincronização concluída, arquivos e lançamentos da base anterior são substituídos pelo conteúdo atual da pasta.
- Se a nova pasta falhar em um arquivo crítico, a base anterior é preservada.
- **Enviar arquivos = adicionar**: upload avulso continua acumulativo.
- Regras/classificações aprendidas permanecem salvas mesmo quando arquivos antigos são substituídos.
- O filtro de competência continua servindo apenas para visualização; nunca limita o upload.

### DRE / Resultados
- Comparação anual passa a usar o mesmo Plano de Contas em todos os meses.
- Contas com valor zero continuam visíveis quando o grupo é expandido.
- Grupos possuem `+ / −`, com ações **Expandir tudo** e **Recolher tudo**.

### Cadastros
- Aviso no topo orienta o cadastro de todas as contas bancárias para reconhecer transferências próprias e evitar falsa receita/despesa.

### Precificação
Novo item no menu, acima de Cadastros:
- modo **Preço → margem**;
- modo **Custo → markup**;
- custos/despesas editáveis, com inclusão e remoção de linhas;
- bases em `% da venda`, `% do custo` ou `R$ por unidade`;
- margem de contribuição em R$ e %;
- meta de margem, preço mínimo, preço recomendado, markup e cenários;
- modelos de precificação salvos por empresa;
- entrada manual de um produto;
- importação de tabela Excel;
- botão **Baixar modelo Excel** com cabeçalhos padrão;
- aplicação da mesma lógica em lote;
- exportação XLSX com produtos e memória de cálculo;
- botão **Comparar com mercado — Luna**, usando pesquisa web quando a Luna estiver configurada.

## Cabeçalhos do modelo de precificação
- `codigo` (opcional)
- `produto` (obrigatório)
- `custo` (obrigatório para cálculo)
- `preco_venda` (opcional no modo custo → markup)
- `categoria` (opcional)
- `marca` (opcional)
- `observacao` (opcional)

## Versão
- App: `0.5.0`
- A versão é exibida no rodapé do menu lateral.
- `/api/health` deve retornar `version: 0.5.0`.

## Deploy
1. Substitua o conteúdo do repositório pelos arquivos deste pacote.
2. Commit/push no GitHub ligado ao Railway.
3. Aguarde build e deploy.
4. Acesse `/api/health` e confirme `0.5.0`.
5. Faça recarga forçada do navegador/PWA.
6. Execute `docs/teste-aceite-v0.5.0.md`.
