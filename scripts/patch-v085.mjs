import fs from 'node:fs'

const read=p=>fs.readFileSync(p,'utf8')
const write=(p,s)=>fs.writeFileSync(p,s)
const replaceIf=(src,from,to)=>{if(src.includes(to))return src;if(!src.includes(from))throw new Error(`text not found: ${from}`);return src.replace(from,to)}

let files=read('client/src/v070.tsx')
const filesMarker='  const files=allSourceFiles||[]\n'
const filesReplacement=`  const files=allSourceFiles||[]
  async function resetFiles(){
    if(!canWrite||processing||!files.length)return
    if(!confirm('Resetar todos os arquivos importados desta empresa?\\n\\nIsso apaga os arquivos e os lançamentos/títulos gerados por eles. Plano de contas, cadastros, regras e configurações serão mantidos.'))return
    const typed=prompt('Para confirmar o reset, digite RESETAR')
    if(String(typed||'').trim().toUpperCase()!=='RESETAR')return
    setProcessing(true)
    try{
      const out=await apiJson('/api/source-files/reset',{method:'DELETE'})
      setPending([]);setReviewFile(null);setOpenType(null)
      await refresh()
      alert(out.message||'Arquivos resetados com sucesso.')
    }catch(e:any){alert(e.message||'Não foi possível resetar os arquivos.')}finally{setProcessing(false)}
  }
`
files=replaceIf(files,filesMarker,filesReplacement)
const titleOld='  return <div className="page-content"><PageTitle eyebrow="ARQUIVOS" title="Entrada e orquestração dos dados" sub="Primeiro selecione os arquivos. Depois diga à Clara qual papel cada um exerce. Assim a leitura fica explícita e você pode usar mais de um arquivo para a mesma origem."/>'
const titleNew='  return <div className="page-content"><PageTitle eyebrow="ARQUIVOS" title="Entrada e orquestração dos dados" sub="Primeiro selecione os arquivos. Depois diga à Clara qual papel cada um exerce. Assim a leitura fica explícita e você pode usar mais de um arquivo para a mesma origem." actions={canWrite&&files.length?<button className="secondary danger" disabled={processing} onClick={resetFiles}><Trash2/>Resetar arquivos</button>:null}/>'
files=replaceIf(files,titleOld,titleNew)
write('client/src/v070.tsx',files)

let server=read('server/src/index.ts')
const routeMarker="app.get('/api/source-files/:id/review',async(req,res)=>{"
const resetRoute=`app.delete('/api/source-files/reset',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId,client=await pool.connect();try{await client.query('BEGIN');const f=await client.query(\`SELECT id FROM source_files WHERE company_id=$1\`,[cid]),fileIds=f.rows.map((x:any)=>x.id);if(!fileIds.length){await client.query('COMMIT');return res.json({ok:true,files:0,transactions:0,payables:0,receivables:0,message:'Não há arquivos importados para resetar.'})}const tx=await client.query(\`SELECT id FROM transactions WHERE company_id=$1 AND source_file_id=ANY($2::uuid[])\`,[cid,fileIds]),txIds=tx.rows.map((x:any)=>x.id);if(txIds.length){await client.query(\`DELETE FROM reconciliation_links WHERE company_id=$1 AND (left_transaction_id=ANY($2::uuid[]) OR right_transaction_id=ANY($2::uuid[]))\`,[cid,txIds]);await client.query(\`DELETE FROM reconciliation_ignores WHERE company_id=$1 AND transaction_id=ANY($2::uuid[])\`,[cid,txIds])}const rec=await client.query(\`DELETE FROM receivables WHERE company_id=$1 AND source_file_id=ANY($2::uuid[]) RETURNING id\`,[cid,fileIds]);const pay=await client.query(\`DELETE FROM payables WHERE company_id=$1 AND source_file_id=ANY($2::uuid[]) RETURNING id\`,[cid,fileIds]);await client.query(\`DELETE FROM transactions WHERE company_id=$1 AND source_file_id=ANY($2::uuid[])\`,[cid,fileIds]);await client.query(\`DELETE FROM source_files WHERE company_id=$1 AND id=ANY($2::uuid[])\`,[cid,fileIds]);await client.query('COMMIT');await auditSafe(cid,'SOURCE_FILES_RESET','source_file',null,{files:fileIds.length,transactions:txIds.length,payables:pay.rowCount,receivables:rec.rowCount});res.json({ok:true,files:fileIds.length,transactions:txIds.length,payables:pay.rowCount,receivables:rec.rowCount,message:\`Reset concluído: ${fileIds.length} arquivo(s) e ${txIds.length} lançamento(s) importado(s) removidos. Cadastros e configurações foram mantidos.\`})}catch(e:any){await client.query('ROLLBACK');res.status(500).json({message:'Não foi possível resetar os arquivos.',detail:e?.message||String(e)})}finally{client.release()}})

`
if(!server.includes("app.delete('/api/source-files/reset'"))server=replaceIf(server,routeMarker,resetRoute+routeMarker)
server=server.replaceAll("version:'0.8.4'","version:'0.8.5'")
write('server/src/index.ts',server)

let main=read('client/src/main.tsx')
main=main.replaceAll("const APP_VERSION='0.8.4'","const APP_VERSION='0.8.5'")
write('client/src/main.tsx',main)

for(const p of ['package.json','client/package.json','server/package.json','client/package-lock.json','server/package-lock.json']){
  let s=read(p)
  s=s.replaceAll('"version": "0.8.4"','"version": "0.8.5"')
  write(p,s)
}

console.log('v0.8.5 source files reset patch applied')
