import React,{useState}from'react'
import{Check}from'lucide-react'
import{apiJson}from'./api'
import'./v086.css'

export function FilteredBulkClassifyV086({period,filters,total,chartAccounts,canWrite,busy,onApplied}:any){
  const[accountId,setAccountId]=useState(''),[working,setWorking]=useState(false)
  const accounts=(chartAccounts||[]).filter((a:any)=>a.active&&!a.is_group)
  async function apply(){
    if(!accountId)return alert('Selecione o Plano de Contas que será aplicado aos lançamentos filtrados.')
    const account=accounts.find((a:any)=>a.id===accountId)
    if(!account)return alert('Plano de Contas inválido.')
    if(!confirm(`Alterar ${total} lançamento(s) filtrado(s) para “${account.name}”?\n\nA Clara também vai memorizar os fornecedores encontrados para as próximas ocorrências.`))return
    setWorking(true)
    try{
      const out=await apiJson('/api/transactions/classify-filtered',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({period,accountId,...filters})})
      alert(`${out.updated||0} lançamento(s) alterado(s) para ${out.category}. ${out.learnedSuppliers||0} fornecedor(es) memorizado(s).`)
      setAccountId('')
      await onApplied?.()
    }catch(e:any){alert(e.message||'Não foi possível alterar os lançamentos filtrados.')}finally{setWorking(false)}
  }
  if(!canWrite||!total)return null
  return <div className="filtered-bulk-v086"><select value={accountId} disabled={busy||working} onChange={e=>setAccountId(e.target.value)}><option value="">Plano de Contas para todos...</option>{accounts.map((a:any)=><option key={a.id} value={a.id}>{a.code?`${a.code} · `:''}{a.name}</option>)}</select><button className="secondary small" disabled={!accountId||busy||working} onClick={apply}><Check/>Alterar todos os filtrados ({total})</button></div>
}
