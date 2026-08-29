import fs from 'node:fs'

function patchFile(path, transforms){
  let text=fs.readFileSync(path,'utf8')
  for(const t of transforms){
    if(text.includes(t.after)) continue
    if(!text.includes(t.before)) throw new Error(`Integration anchor not found in ${path}: ${t.name}`)
    text=text.replace(t.before,t.after)
  }
  fs.writeFileSync(path,text)
}

patchFile('server/src/index.ts',[
  {
    name:'v070 import',
    before:"import { suggestNegativeParties, adaptUnknownPdf, compareMarketProducts } from './services/ai.js'",
    after:"import { suggestNegativeParties, adaptUnknownPdf, compareMarketProducts } from './services/ai.js'\nimport { registerV070Routes } from './v070.js'"
  },
  {
    name:'public demo session',
    before:"function isPublicApi(url:string){return url==='/api/health'||url==='/api/auth/status'||url==='/api/auth/login'||url==='/api/auth/register'}",
    after:"function isPublicApi(url:string){return url==='/api/health'||url==='/api/auth/status'||url==='/api/auth/login'||url==='/api/auth/register'||url==='/api/demo/session'}"
  },
  {
    name:'register v070 routes',
    before:"const upload={array:(..._args:any[])=>collectUploads}\n\nconst demo=",
    after:"const upload={array:(..._args:any[])=>collectUploads}\nregisterV070Routes(app)\n\nconst demo="
  },
  {
    name:'source file receivables cleanup',
    before:"app.delete('/api/source-files/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId;await pool.query(`DELETE FROM payables WHERE company_id=$1 AND source_file_id=$2`,[cid,req.params.id]);",
    after:"app.delete('/api/source-files/:id',async(req,res)=>{if(!pool)return res.status(503).json({message:'Banco não configurado'});const cid=req.companyId;await pool.query(`DELETE FROM receivables WHERE company_id=$1 AND source_file_id=$2`,[cid,req.params.id]);await pool.query(`DELETE FROM payables WHERE company_id=$1 AND source_file_id=$2`,[cid,req.params.id]);"
  }
])

let server=fs.readFileSync('server/src/index.ts','utf8')
server=server.replaceAll("version:'0.6.1'","version:'0.7.0'").replace('Clara BPO v0.6.1 on','Clara BPO v0.7.0 on')
fs.writeFileSync('server/src/index.ts',server)

patchFile('server/src/v070.ts',[
  {
    name:'classified direction type',
    before:"const account=await ensureAccount(cid,category,direction)\n    await pool!.query(`INSERT INTO transactions",
    after:"const account=await ensureAccount(cid,category,direction as 'ENTRADA'|'SAIDA')\n    await pool!.query(`INSERT INTO transactions"
  }
])

patchFile('client/src/main.tsx',[
  {
    name:'v070 imports',
    before:"import{queryClient}from'./queryClient'\nimport'./styles.css'",
    after:"import{queryClient}from'./queryClient'\nimport{FilesPageV070,PayablesPageV070,ReceivablesPage,ReconciliationPageV070,PresentationPage,DemoSessionGate,DemoNotice}from'./v070'\nimport'./styles.css'"
  },
  {
    name:'page types',
    before:"type Page='resumo'|'arquivos'|'lancamentos'|'conciliacao'|'dre'|'contas_pagar'|'precificacao'|'cadastros'|'configuracoes'|'administracao'",
    after:"type Page='resumo'|'arquivos'|'lancamentos'|'conciliacao'|'dre'|'contas_pagar'|'contas_receber'|'precificacao'|'apresentacao'|'cadastros'|'configuracoes'|'administracao'"
  },
  {
    name:'main app demo flag',
    before:"function MainApp({session,onLogout,onSessionChange}:any){\n  const[page,setPage]=useState<Page>('resumo')",
    after:"function MainApp({session,onLogout,onSessionChange,demoMode=false}:any){\n  const[page,setPage]=useState<Page>('arquivos')"
  },
  {
    name:'company switch opens files',
    before:"async function switchCompany(id:string){localStorage.setItem(COMPANY_KEY,id);await tanstack.invalidateQueries();setPage('resumo');window.location.reload()}",
    after:"async function switchCompany(id:string){localStorage.setItem(COMPANY_KEY,id);await tanstack.invalidateQueries();setPage('arquivos');window.location.reload()}"
  },
  {
    name:'demo aware logout',
    before:"function logout(){apiJson('/api/auth/logout',{method:'POST'}).catch(()=>{});localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(COMPANY_KEY);onLogout();navigate('/')}",
    after:"function logout(){if(demoMode){onLogout?.();navigate('/');return}apiJson('/api/auth/logout',{method:'POST'}).catch(()=>{});localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(COMPANY_KEY);onLogout();navigate('/')}"
  },
  {
    name:'new navigation',
    before:"const nav:[Page,any,string][]=[['resumo',Home,'Resumo'],['arquivos',FolderOpen,'Arquivos'],['lancamentos',ListChecks,'Lançamentos'],['conciliacao',RefreshCcw,'Conciliação'],['dre',BarChart3,'DRE / Resultados'],['contas_pagar',WalletCards,'Contas a Pagar'],['precificacao',Calculator,'Precificação'],['cadastros',Landmark,'Cadastros'],['configuracoes',Settings,'Configurações']]",
    after:"const nav:[Page,any,string][]=[['resumo',Home,'Resumo'],['arquivos',FolderOpen,'Arquivos'],['lancamentos',ListChecks,'Lançamentos'],['conciliacao',RefreshCcw,'Conciliação'],['dre',BarChart3,'DRE / Resultados'],['contas_pagar',WalletCards,'Contas a Pagar'],['contas_receber',ArrowDownRight,'Contas a Receber'],['precificacao',Calculator,'Precificação'],['apresentacao',FileSpreadsheet,'Apresentação'],['cadastros',Landmark,'Cadastros'],['configuracoes',Settings,'Configurações']]"
  },
  {
    name:'files v070 render',
    before:"if(page==='arquivos')return <FilesPage sourceHealth={sourceHealth} allSourceFiles={allSourceFiles} uploading={uploading} canWrite={canWrite} folderRef={folderRef} fileRef={fileRef} upload={upload} refresh={refresh} onGoTransactions={()=>setPage('lancamentos')}/>",
    after:"if(page==='arquivos')return <FilesPageV070 sourceHealth={sourceHealth} allSourceFiles={allSourceFiles} canWrite={canWrite} folderRef={folderRef} fileRef={fileRef} refresh={refresh} onGoTransactions={()=>setPage('lancamentos')}/>"
  },
  {
    name:'reconciliation v070 render',
    before:"if(page==='conciliacao')return <ReconciliationPage reconciliation={reconciliation} sourceHealth={sourceHealth} period={period} refresh={refresh}/>",
    after:"if(page==='conciliacao')return <ReconciliationPageV070 reconciliation={reconciliation} sourceHealth={sourceHealth} period={period} refresh={refresh}/>"
  },
  {
    name:'payables receivables presentation render',
    before:"if(page==='contas_pagar')return <PayablesPage period={period} chartAccounts={chartAccounts} canWrite={canWrite}/>\n    if(page==='precificacao')return <PricingPage canWrite={canWrite}/>",
    after:"if(page==='contas_pagar')return <PayablesPageV070 period={period} chartAccounts={chartAccounts} canWrite={canWrite}/>\n    if(page==='contas_receber')return <ReceivablesPage period={period} chartAccounts={chartAccounts} canWrite={canWrite}/>\n    if(page==='precificacao')return <PricingPage canWrite={canWrite}/>\n    if(page==='apresentacao')return <PresentationPage period={period}/>"
  },
  {
    name:'demo topbar notice',
    before:"<div className=\"top-controls\"><select className=\"company-select\"",
    after:"{demoMode&&<DemoNotice/>}<div className=\"top-controls\"><select className=\"company-select\""
  },
  {
    name:'full demo root',
    before:"if(path==='/demonstracao')return <DemoApp/>",
    after:"if(path==='/demonstracao')return <DemoSessionGate render={(demoSession:any)=><MainApp session={demoSession} onLogout={()=>navigate('/')} onSessionChange={()=>{}} demoMode/>}/>"
  }
])

let client=fs.readFileSync('client/src/main.tsx','utf8')
client=client.replace("const APP_VERSION='0.6.1'","const APP_VERSION='0.7.0'")
fs.writeFileSync('client/src/main.tsx',client)

console.log('v0.7.0 integration applied')
