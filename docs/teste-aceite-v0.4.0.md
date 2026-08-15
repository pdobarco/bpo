# Teste de aceite — Clara v0.4.0

1. `/api/health` retorna `version=0.4.0`, `database=ok`, `schema=0.4.0`.
2. Abrir `/` sem sessão exibe a nova tela de login e a logo oficial.
3. Login do master funciona com a senha configurada em `MASTER_INITIAL_PASSWORD`.
4. MASTER vê **Administração** no menu.
5. Criar uma nova empresa; ela aparece no seletor do topo.
6. Criar um usuário, vinculá-lo a uma empresa e depois editar perfil/vínculos.
7. Entrar com esse usuário e confirmar que ele só vê empresas permitidas.
8. Perfil VIEWER não consegue gravar alterações.
9. Perfil OPERATOR não consegue alterar Plano de Contas/empresa/fechamento.
10. Abrir `/demonstracao` sem login; dados devem ser fictícios e nenhuma gravação deve ocorrer.
11. Trocar de empresa no topo e verificar que dashboard/DRE/lançamentos mudam para a empresa selecionada.
12. Importar arquivo e revisar lançamentos normalmente.
13. Editar competência e Plano de Contas em um lançamento.
14. Ordenar a tabela clicando nos títulos.
15. Conferir DRE com valores próximos das descrições.
