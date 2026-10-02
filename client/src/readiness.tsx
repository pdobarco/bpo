import React from'react'
import{AlertTriangle,ArrowUpRight,CheckCircle2,FileWarning,FolderOpen,Landmark,ListChecks,Lock}from'lucide-react'

export type ReadinessItem={key:string,label:string,detail?:string,page:string,tone:'warn'|'ok'|'info'}

/**
 * UX-008 — Uma única lista do que falta para fechar o mês, derivada do mesmo /api/period-status
 * usado pelo badge "Dados X%", pelo KPI de pendências e pelo botão Fechar período.
 */
export function readinessItems(status:any,groupsCount:number):ReadinessItem[]{
  const items:ReadinessItem[]=[]
  if(status?.closed)return[{key:'closed',label:'Período fechado',detail:'A DRE deste mês está congelada. Reabra o mês para alterar lançamentos.',page:'dre',tone:'info'}]
  const health=status?.sourceHealth||{}
  const expected:any[]=health.expected||[]
  const files:any[]=health.files||[]
  if(!files.length&&!expected.length)items.push({key:'no-files',label:'Nenhum arquivo recebido neste mês',detail:'Importe os extratos e relatórios do período.',page:'arquivos',tone:'warn'})
  for(const e of expected){
    if(e.state==='MISSING')items.push({key:'missing-'+e.kind,label:`Falta o arquivo: ${e.label}`,detail:'Fonte esperada para todo fechamento.',page:'arquivos',tone:'warn'})
    else if(e.state==='REVIEW')items.push({key:'review-'+e.kind,label:`Arquivo para revisar: ${e.label}`,detail:e.file?.status_detail||'A leitura encontrou divergência.',page:'arquivos',tone:'warn'})
  }
  const reviewedKinds=new Set(expected.filter(e=>e.state==='REVIEW').map(e=>e.kind))
  const otherReview=files.filter(f=>(f.status!=='IMPORTED'||f.validation_status==='MISMATCH')&&!reviewedKinds.has(f.kind))
  if(otherReview.length)items.push({key:'files-review',label:`${otherReview.length} arquivo(s) para revisar`,detail:otherReview.slice(0,2).map(f=>f.name).join(' · '),page:'arquivos',tone:'warn'})
  if(groupsCount>0)items.push({key:'classify',label:`${groupsCount} nome(s) para classificar`,detail:status?.unclassifiedValue?`Valor ainda sem classificação: ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(status.unclassifiedValue)}`:'Confirme uma vez e a Clara reaproveita nas próximas importações.',page:'lancamentos',tone:'warn'})
  return items
}

const ICON:Record<string,any>={arquivos:FolderOpen,lancamentos:ListChecks,dre:Lock,cadastros:Landmark}

export function ReadinessList({items,onGo,compact=false}:{items:ReadinessItem[],onGo:(page:any)=>void,compact?:boolean}){
  if(!items.length)return <div className="readiness-ok"><CheckCircle2 aria-hidden="true"/><div><b>Tudo pronto para fechar o mês</b><span>Arquivos conferidos e classificações em dia.</span></div><button className="secondary small" onClick={()=>onGo('dre')}>Ir para o fechamento <ArrowUpRight aria-hidden="true"/></button></div>
  return <ul className={'readiness-list'+(compact?' compact':'')}>
    {items.map(it=>{const Icon=it.tone==='info'?Lock:(ICON[it.page]||(it.key.startsWith('review')?FileWarning:AlertTriangle));return <li key={it.key} className={it.tone}>
      <Icon aria-hidden="true"/>
      <div><b>{it.label}</b>{it.detail&&!compact&&<span>{it.detail}</span>}</div>
      <button className="text-btn" onClick={()=>onGo(it.page)}>Resolver <ArrowUpRight aria-hidden="true"/></button>
    </li>})}
  </ul>
}

/** UX-011 — Primeiros passos para empresa sem dados, no lugar de uma DRE e um gráfico zerados. */
export function OnboardingChecklist({files,companyAccounts,groupsCount,onGo}:{files:any[],companyAccounts:any[],groupsCount:number,onGo:(page:any)=>void}){
  const kinds=new Set(files.map(f=>f.kind))
  const steps=[
    {key:'banks',done:companyAccounts.length>0,title:'Cadastre as contas bancárias da empresa',detail:'A Clara usa as contas para reconhecer transferências entre contas próprias.',page:'cadastros',cta:'Cadastrar contas'},
    {key:'bank',done:kinds.has('BANK_STATEMENT')||kinds.has('NUBANK_STATEMENT')||kinds.has('PAGBANK_STATEMENT'),title:'Importe o extrato bancário do mês',detail:'PDF ou Excel de qualquer banco. É a base do caixa e da conciliação.',page:'arquivos',cta:'Importar extrato'},
    {key:'sales',done:kinds.has('SALES_REPORT')||kinds.has('CARD_MACHINE_STATEMENT')||kinds.has('PAGBANK_SALES'),title:'Importe as vendas',detail:'Relatório de vendas/caixa ou extrato da maquininha: a receita da DRE vem daqui.',page:'arquivos',cta:'Importar vendas'},
    {key:'classify',done:files.length>0&&groupsCount===0,title:'Confirme as classificações',detail:'Ensine a Clara uma vez por fornecedor; ela repete nas próximas importações.',page:'lancamentos',cta:'Classificar'}
  ]
  const doneCount=steps.filter(s=>s.done).length
  return <div className="card onboarding">
    <div className="card-head"><div><b>Primeiros passos</b><span>{doneCount} de {steps.length} concluídos. Ao terminar, o Resumo passa a mostrar DRE, caixa e indicadores do mês.</span></div></div>
    <ol className="onboarding-steps">{steps.map((s,i)=><li key={s.key} className={s.done?'done':''}>
      <span className="step-mark" aria-hidden="true">{s.done?<CheckCircle2/>:i+1}</span>
      <div><b>{s.title}</b><span>{s.detail}</span></div>
      {s.done?<span className="pill green">Concluído</span>:<button className="primary small" onClick={()=>onGo(s.page)}>{s.cta}</button>}
    </li>)}</ol>
  </div>
}
