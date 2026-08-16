# Deploy rápido — Clara v0.4.4

1. Substitua o conteúdo do repositório pelos arquivos desta versão.
2. Faça commit/push para o branch conectado ao Railway.
3. Aguarde o build e o deploy concluírem.
4. Abra `/api/health` no domínio do Railway e confirme:

```json
{"ok":true,"version":"0.4.4","database":"ok"}
```

5. No Chrome, faça `Ctrl+Shift+R` uma vez para eliminar assets antigos da PWA.
6. Confirme no rodapé da sidebar `Clara BPO · v0.4.4`.
7. Reimporte os quatro PDFs de teste.

A correção principal desta versão é o cast explícito de parâmetros opcionais enviados ao PostgreSQL durante a importação, eliminando `could not determine data type of parameter $3`.
