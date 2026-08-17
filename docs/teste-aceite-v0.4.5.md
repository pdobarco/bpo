# Teste de aceite — Clara v0.4.5

1. Publicar a v0.4.5 e confirmar `/api/health` com `version: 0.4.5`.
2. Confirmar `Clara BPO · v0.4.5` no rodapé da sidebar.
3. Na mesma empresa onde os quatro PDFs haviam falhado na v0.4.3/v0.4.4, reenviar exatamente os mesmos quatro arquivos.
4. O popup **não pode** mostrar `4 duplicado(s) ignorado(s)` apenas por existirem registros antigos de erro.
5. O resumo deve indicar que falhas anteriores foram reprocessadas.
6. Depois do upload, abrir Central de Arquivos e verificar que os erros antigos foram substituídos pelo resultado da nova tentativa.
7. Abrir Lançamentos e selecionar os meses presentes nos próprios documentos; o mês selecionado no momento do upload não interfere na importação.
8. Reenviar novamente um arquivo que já tenha sido processado com sucesso. Só nesse caso ele deve aparecer como duplicado e ser ignorado.
