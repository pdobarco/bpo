# Clara BPO Financeiro — v0.4.1

Versão de refinamento visual que aproxima a aplicação do **mockup aprovado**, mantendo as funcionalidades da v0.4.0: autenticação, cadastro, multiempresa, administração MASTER e demonstração pública.

## O que mudou na v0.4.1

- reconstrução da tela inicial/login para seguir a composição do mockup aprovado;
- fundo externo claro e grande container branco arredondado;
- lado esquerdo institucional com headline, benefícios, grafismos leves e personagem inspirada no mockup;
- lado direito com card de login/cadastro mais compacto e elegante;
- uso da **logo oficial exatamente como enviada**; o arquivo original foi preservado byte a byte em `client/public/clara-logo-original.png`;
- novo dashboard interno mais próximo do mockup: menu lateral azul, KPIs executivos, DRE, gráfico Receita x Despesas e bloco de conciliação;
- `/demonstracao` atualizado para usar a mesma linguagem visual com dados totalmente fictícios;
- preservadas todas as regras e dados da v0.4.0;
- nenhum novo ajuste estrutural no PostgreSQL: o schema continua `0.4.0`.

O mockup aprovado também foi incluído como referência em `docs/mockup-aprovado-v0.4.1.png`.

## Funcionalidades preservadas

- login e cadastro;
- usuário MASTER `thomas.muller@bateriasmoura.com`;
- perfis `MASTER`, `ADMIN`, `OPERATOR` e `VIEWER`;
- cadastro e administração de empresas;
- vínculo de usuários a uma ou mais empresas;
- rota pública `/demonstracao`;
- arquivos, lançamentos, edição de competência/Plano de Contas, conciliação, DRE, fechamento e auditoria;
- Drizzle + PostgreSQL + Railway.

## Deploy no Railway

1. Substitua os arquivos do repositório pelos desta versão.
2. **Não apague nem recrie o PostgreSQL.**
3. Mantenha exatamente a mesma `DATABASE_URL` usada na versão atual.
4. Mantenha as variáveis abaixo:

```env
MASTER_EMAIL=thomas.muller@bateriasmoura.com
MASTER_INITIAL_PASSWORD=UMA_SENHA_FORTE_COM_PELO_MENOS_8_CARACTERES
SESSION_DAYS=30
```

5. Faça o deploy e confira `/api/health`.

Resposta esperada:

```json
{
  "ok": true,
  "version": "0.4.1",
  "database": "ok",
  "schema": "0.4.0"
}
```

O schema continuar em `0.4.0` é intencional: a v0.4.1 é uma evolução visual/UX e não cria novas tabelas.
