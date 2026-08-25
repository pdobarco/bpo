# Deploy rápido — Clara v0.5.0

1. Faça backup do repositório atual.
2. Substitua pelos arquivos deste pacote e envie ao GitHub ligado ao Railway.
3. O build executa `npm run build` e o startup cria/adota a tabela `pricing_models` automaticamente.
4. Aguarde o deploy e abra `/api/health`.
5. Confirme `"version":"0.5.0"` e `database:"ok"`.
6. Faça uma recarga forçada/PWA para atualizar o frontend.
7. Rode `docs/teste-aceite-v0.5.0.md`.

## Variáveis da Luna
Para o botão **Comparar com mercado — Luna**:
- `AI_ENABLED=true`
- `OPENAI_API_KEY=...`
- opcional: `OPENAI_MODEL=gpt-5.6-luna`

Sem essas variáveis, o restante do módulo de Precificação continua funcionando normalmente.
