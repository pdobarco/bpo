# Checklist de aceite — Claria v0.3.1

## 1. Build no Railway

- O `npm run install:all` deve concluir client e server sem `ERESOLVE` entre OpenAI e Zod.
- O `npm run build` deve compilar server TypeScript e client Vite.
- O warning de `npm config production` não é, sozinho, uma falha de build.

## 2. Health

Abra `/api/health` e confira:

```json
{
  "ok": true,
  "version": "0.3.1",
  "database": "ok",
  "schema": "0.3.0"
}
```

O schema permanecer em `0.3.0` é esperado: a v0.3.1 não muda o banco.

## 3. Dados existentes

- Não recriar o PostgreSQL.
- Confirmar que os arquivos, lançamentos, classificações e DRE anteriores continuam presentes.

## 4. Lançamentos

- Abrir `Lançamentos > Todos os lançamentos`.
- Confirmar que a lista carrega ao entrar na aba e ao trocar o mês.
- Confirmar competência sem `Invalid Date`.
- Testar edição de competência e Plano de Contas.
- Testar ordenação pelos cabeçalhos.

## 5. DRE

- Confirmar os valores mais próximos dos títulos.
- Confirmar que uma alteração de competência/plano de contas é refletida na DRE do período correto.

## 6. IA

Se `AI_ENABLED=true`, testar uma sugestão da Luna depois que o restante da aplicação estiver funcionando. A atualização do SDK OpenAI foi feita para compatibilidade com Zod 4; a chave continua somente nas Variables do Railway.
