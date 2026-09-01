import fs from 'node:fs'

const read=p=>fs.readFileSync(p,'utf8')
const write=(p,s)=>fs.writeFileSync(p,s)
const replaceOnce=(src,from,to)=>{if(src.includes(to))return src;if(!src.includes(from))throw new Error(`text not found: ${from.slice(0,140)}`);return src.replace(from,to)}

let main=read('client/src/main.tsx')
main=replaceOnce(main,"import{CashAvailabilityCard}from'./v080dash'","import{CashAvailabilityCard}from'./v080dash'\nimport{FilteredBulkClassifyV086}from'./v086'")
main=main.replaceAll("const APP_VERSION='0.8.5'","const APP_VERSION='0.8.6'")
main=replaceOnce(main,
"const{reviewMode,setReviewMode,groups,categories,confirmGroup,askLuna,busy,query,transactions,filters,setFilters,sort,toggleSort,expanded,setExpanded,editingTx,startTxEdit,setEditingTx,txEdit,setTxEdit,saveTxEdit,chartAccounts,canWrite,confirmTransactions}=props",
"const{reviewMode,setReviewMode,groups,categories,confirmGroup,askLuna,busy,query,transactions,filters,setFilters,sort,toggleSort,expanded,setExpanded,editingTx,startTxEdit,setEditingTx,txEdit,setTxEdit,saveTxEdit,chartAccounts,canWrite,confirmTransactions,period,refresh}=props")
main=replaceOnce(main,
"<div><b>{selected.size} selecionado(s)</b><button className=\"primary small\" disabled={!selected.size||busy} onClick={doConfirm}><Check/>Confirmar selecionados</button></div>",
"<div className=\"bulk-actions-v086\"><FilteredBulkClassifyV086 period={period} filters={filters} total={transactions.total} chartAccounts={chartAccounts} canWrite={canWrite} busy={busy} onApplied={async()=>{setSelected(new Set());await query.refetch();await refresh?.()}}/><div><b>{selected.size} selecionado(s)</b><button className=\"primary small\" disabled={!selected.size||busy} onClick={doConfirm}><Check/>Confirmar selecionados</button></div></div>")
main=replaceOnce(main,
"if(page==='lancamentos')return <TransactionsPage reviewMode={reviewMode}",
"if(page==='lancamentos')return <TransactionsPage period={period} refresh={refresh} reviewMode={reviewMode}")
write('client/src/main.tsx',main)

let server=read('server/src/index.ts')
server=replaceOnce(server,
"import { registerV083Routes,initV083Schema } from './v083.js'",
"import { registerV083Routes,initV083Schema } from './v083.js'\nimport { registerV086Routes,initV086Schema } from './v086.js'")
server=replaceOnce(server,
"registerV083Routes(app)",
"registerV083Routes(app)\nregisterV086Routes(app)")
server=replaceOnce(server,
"  await initV083Schema()\n  await ensureMasterUser()",
"  await initV083Schema()\n  await initV086Schema()\n  await ensureMasterUser()")
server=server.replaceAll("version:'0.8.5'","version:'0.8.6'")
write('server/src/index.ts',server)

for(const p of ['package.json','client/package.json','server/package.json','client/package-lock.json','server/package-lock.json']){
  let s=read(p)
  s=s.replaceAll('"version": "0.8.5"','"version": "0.8.6"')
  write(p,s)
}

console.log('v0.8.6 filtered bulk classification patch applied')
