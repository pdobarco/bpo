# Clara BPO Financeiro — v0.4.0

Versão que adiciona autenticação, multiempresa, administração de usuários/empresas, demonstração pública e a nova identidade visual **Clara BPO Financeiro**.

## O que entrou

- nova tela inicial/login inspirada no mockup aprovado;
- aplicação da **logo oficial enviada**, sem redesenho ou alteração de cores/tipografia; o arquivo original também foi preservado em `client/public/clara-logo-original.png`;
- usuário master padrão: `thomas.muller@bateriasmoura.com`;
- sessões seguras com token aleatório armazenado apenas como hash no PostgreSQL;
- perfis `MASTER`, `ADMIN`, `OPERATOR` e `VIEWER`;
- cadastro público de nova conta + nova empresa;
- seletor de empresa no topo para usuários vinculados a mais de uma empresa;
- área **Administração** para o MASTER cadastrar empresas e criar/editar usuários, perfis e vínculos;
- rota pública `/demonstracao` com dados 100% fictícios e sem gravação;
- novo layout interno com menu lateral azul-marinho, cards claros e dashboard executivo;
- preservadas as funcionalidades anteriores de arquivos, lançamentos, edição de competência/plano, conciliação, DRE, fechamento e auditoria;
- Drizzle/PostgreSQL preservados; migração `0001_auth_multiempresa.sql` adiciona somente as novas estruturas.

## Deploy no Railway

1. Substitua o conteúdo do repositório pelos arquivos desta versão.
2. **Não apague o PostgreSQL atual.**
3. Mantenha a mesma `DATABASE_URL`.
4. Adicione nas Variables do Railway:

```env
MASTER_EMAIL=thomas.muller@bateriasmoura.com
MASTER_INITIAL_PASSWORD=UMA_SENHA_FORTE_COM_PELO_MENOS_8_CARACTERES
SESSION_DAYS=30
```

5. Mantenha também as variáveis de IA e upload que já existiam.
6. Faça o deploy.
7. Confira `/api/health`.

Resposta esperada:

```json
{
  "ok": true,
  "version": "0.4.0",
  "database": "ok",
  "schema": "0.4.0"
}
```

## Primeiro login MASTER

Use:

- e-mail: `thomas.muller@bateriasmoura.com`
- senha: o valor definido em `MASTER_INITIAL_PASSWORD` no Railway.

A variável `MASTER_INITIAL_PASSWORD` só preenche a senha quando o master ainda não possui senha cadastrada. Reiniciar o serviço não redefine uma senha já existente.

## Demonstração

Acesse diretamente:

```text
/demonstracao
```

A demonstração usa somente dados fictícios no frontend e não acessa nem altera os dados reais das empresas.

## Perfis

- **MASTER:** todas as empresas + administração global.
- **ADMIN:** administração financeira/configurações das empresas vinculadas.
- **OPERATOR:** importação, classificação e operação; sem alterações estruturais da empresa.
- **VIEWER:** somente leitura.
