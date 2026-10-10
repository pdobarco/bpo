## GitHub Actions: custo e qualidade

Minutos de Actions são limitados. Qualidade não é negociável: o custo se reduz rodando só o necessário, não testando menos.

**Nunca**
- Criar workflow para aplicar patch, editar código ou comitar no repositório (`contents: write` + `git push`). Faça a mudança localmente, rode os testes e abra PR.
- Criar workflow preso a uma branch específica ou com nome de versão/auditoria (`patch-*`, `run-*`, `audit-*`). Para validação pontual use `workflow_dispatch` num workflow existente.
- Disparar o mesmo teste em `push` e `pull_request` da mesma branch.
- Deixar job sem `timeout-minutes`.

**Sempre, em todo workflow novo ou alterado**
- `concurrency` com `cancel-in-progress: true` (agrupado por workflow + PR/ref).
- `paths:` para só rodar quando os arquivos relevantes mudam; docs/md/imagens não disparam CI.
- `npm ci` com cache do setup-node; cache de browsers do Playwright.
- Jobs pesados (Playwright, Postgres, build completo, regressão total) restritos aos paths que os afetam ou manuais.
- Se o host de deploy já builda a cada merge, o Actions não repete o build.

**Qualidade (não reduzir)**
- Todo PR para `main` passa pelo gate de testes + build antes do merge.
- Não remover, pular ou enfraquecer testes para economizar minutos.
- Auditoria completa (todos os testes, regressão contra base) fica em `full-regression.yml`, manual.
- Ao remover ou mover um check, registre na PR por que a garantia continua coberta.

**Antes de abrir PR**: rode build e testes localmente; evite pushes sequenciais pequenos (agrupe commits) porque cada push em PR dispara CI.
