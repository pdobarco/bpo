import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Home, FolderOpen, ListChecks, RefreshCcw, BarChart3, Building2, Settings, Menu, X, Upload, CheckCircle2, AlertTriangle, Search, ChevronDown, WalletCards, Sparkles, ArrowUpRight, ArrowDownRight, Brain, Users, Check, WandSparkles, Pencil, Save } from 'lucide-react'
import './styles.css'

const BRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
const fmt = v => BRL.format(Number(v || 0))

const demo = {
  company: { id:'demo', name:'Encantê Natural', sector:'Comércio', activity:'Produtos naturais' },
  summary: { balance:5731.62,inflow:11096.69,outflow:13113.60,pending:5,revenue:10601,result:-6999 },
  months:[2379,6490,10562,19005,14445,19278,10601],
  files:[{name:'Extrato PagBank Julho.pdf',type:'Extrato bancário',count:35,status:'Importado'},{name:'Extrato Nubank Julho.pdf',type:'Extrato bancário',count:48,status:'Importado'}],
  tx:[
    {id:'1',date:'31/07/2026',description:'Transferência Recebida Raissa Rafaela Dias da Silva',normalizedParty:'RAISSA RAFAELA DIAS DA SILVA',amount:179,type:'ENTRADA',category:'Receita de vendas',confidence:78,status:'SUGGESTED',source:'HEURISTIC'},
    {id:'2',date:'23/07/2026',description:'EPLACE COPIADORA E GRAFICA RAPIDA',normalizedParty:'EPLACE COPIADORA E GRAFICA RAPIDA',amount:-133.2,type:'SAIDA',category:'Material de escritório / gráfica',confidence:91,status:'SUGGESTED',source:'AI'}
  ]
}

const fallbackCategories=['Receita de vendas','Compra de mercadoria / insumos','Fretes e entregas','Marketing e anúncios','Impostos e tributos','Sistemas e tecnologia','Energia elétrica','Água e saneamento','Aluguel e ocupação','Contabilidade e serviços profissionais','Serviços terceirizados','Material de escritório / gráfica','Taxas bancárias e financeiras','Folha / pessoas','Retirada do sócio','Reembolso','Transferência entre contas','Outras despesas']

function Logo({compact=false}){return <div className="brand"><img src="/logo-mark.svg"/><div className={compact?'hide-mobile':''}><strong>Claria</strong><span>gestão simples</span></div></div>}
function Kpi({title,value,sub,tone='neutral',icon}){return <div className={'kpi '+tone}><div className="kpi-head"><span>{title}</span>{icon}</div><strong>{value}</strong><small>{sub}</small></div>}
function MiniChart({values}){const max=Math.max(...values,1);return <div className="mini-chart">{values.map((v,i)=><div key={i} className="bar-wrap"><div className="bar" style={{height:`${Math.max(8,(v/max)*100)}%`}}/><span>M{i+1}</span></div>)}</div>}

function ReviewCard({g,categories,onConfirm,busy}){
  const [category,setCategory]=useState(g.category==='A classificar'?(g.direction==='ENTRADA'?'Receita de vendas':'Outras despesas'):g.category)
  useEffect(()=>setCategory(g.category==='A classificar'?(g.direction==='ENTRADA'?'Receita de vendas':'Outras despesas'):g.category),[g.category,g.direction])
  const ai=g.source==='AI'
  return <div className="review-card">
    <div className="review-main">
      <div className={'direction-dot '+(g.direction==='ENTRADA'?'in':'out')}>{g.direction==='ENTRADA'?<ArrowDownRight/>:<ArrowUpRight/>}</div>
      <div className="review-person"><b>{titleCase(g.normalizedParty)}</b><span>{g.count} {g.count===1?'movimentação':'movimentações'} · {fmt(Math.abs(g.total))}</span></div>
    </div>
    <div className="review-suggestion">
      <div className="suggestion-label">{ai?<><Brain size={15}/> Sugestão da Luna</>:g.direction==='ENTRADA'?'Sugestão':'Classifique uma vez'}</div>
      <select value={category} onChange={e=>setCategory(e.target.value)}>
        {categories.map(c=><option key={c}>{c}</option>)}
      </select>
      {g.confidence>0&&<span className="confidence">{g.confidence}% confiança</span>}
    </div>
    <button className="confirm-btn" disabled={busy} onClick={()=>onConfirm(g,category)}><Check size={17}/> Confirmar</button>
  </div>
}

const titleCase=s=>(s||'').toLowerCase().replace(/\b\p{L}/gu,c=>c.toUpperCase())

function App(){
  const [page,setPage]=useState('inicio'),[menu,setMenu]=useState(false),[data,setData]=useState(demo),[search,setSearch]=useState(''),[uploading,setUploading]=useState(false)
  const [groups,setGroups]=useState([]),[categories,setCategories]=useState(fallbackCategories),[reviewMode,setReviewMode]=useState(true),[busy,setBusy]=useState(false),[lunaBusy,setLunaBusy]=useState(false),[editingCompany,setEditingCompany]=useState(false)
  const [companyDraft,setCompanyDraft]=useState(demo.company)
  const folderRef=useRef(),fileRef=useRef()

  async function refresh(){
    try{
      const [d,g,c]=await Promise.all([fetch('/api/dashboard').then(r=>r.json()),fetch('/api/review-groups').then(r=>r.json()),fetch('/api/categories').then(r=>r.json())])
      setData(d);setGroups(g.groups||[]);if(Array.isArray(c)&&c.length)setCategories(c);setCompanyDraft(d.company||demo.company)
    }catch{}
  }
  useEffect(()=>{refresh()},[])
  const tx=useMemo(()=>data.tx.filter(t=>(t.description||'').toLowerCase().includes(search.toLowerCase())||(t.category||'').toLowerCase().includes(search.toLowerCase())),[data,search])
  const likelyRevenue=groups.filter(g=>g.direction==='ENTRADA'&&g.category==='Receita de vendas')
  const unknownNegative=groups.filter(g=>g.direction==='SAIDA'&&(g.category==='A classificar'||!g.source))

  async function upload(files){if(!files?.length)return;setUploading(true);const fd=new FormData();[...files].forEach(f=>fd.append('files',f,f.webkitRelativePath||f.name));try{const r=await fetch('/api/import',{method:'POST',body:fd});const j=await r.json();alert(j.message||'Importação concluída');await refresh()}catch{alert('Não foi possível enviar agora.')}finally{setUploading(false)}}
  async function confirmGroup(g,category){setBusy(true);try{await fetch('/api/review-groups/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({normalizedParty:g.normalizedParty,direction:g.direction,category,remember:true})});await refresh()}finally{setBusy(false)}}
  async function confirmRevenueBatch(){if(!likelyRevenue.length)return;setBusy(true);try{await fetch('/api/review-groups/classify-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:likelyRevenue.map(g=>({normalizedParty:g.normalizedParty,direction:'ENTRADA',category:'Receita de vendas'}))})});await refresh()}finally{setBusy(false)}}
  async function askLuna(){setLunaBusy(true);try{const r=await fetch('/api/ai/suggest',{method:'POST'});const j=await r.json();if(!r.ok)alert(j.message||'A Luna não conseguiu sugerir agora.');await refresh()}finally{setLunaBusy(false)}}
  async function saveCompany(){setBusy(true);try{await fetch('/api/company',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(companyDraft)});setEditingCompany(false);await refresh()}finally{setBusy(false)}}

  const nav=[['inicio',Home,'Início'],['arquivos',FolderOpen,'Arquivos'],['lancamentos',ListChecks,'Lançamentos'],['conciliacao',RefreshCcw,'Conciliação'],['gestao',BarChart3,'Gestão']]
  return <div className="shell">
    <aside className={menu?'sidebar open':'sidebar'}><div className="side-top"><Logo/><button className="icon-btn close" onClick={()=>setMenu(false)}><X/></button></div><div className="company"><Building2/><div><small>Empresa</small><b>{data.company?.name||'Minha empresa'}</b></div><ChevronDown/></div><nav>{nav.map(([id,I,label])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setMenu(false)}}><I size={20}/>{label}</button>)}</nav><div className="side-bottom"><button><Settings size={19}/>Configurações</button><span>Claria v0.1.1</span></div></aside>
    <main><header><button className="icon-btn mobile" onClick={()=>setMenu(true)}><Menu/></button><div><h1>{nav.find(n=>n[0]===page)?.[2]}</h1><p>{page==='inicio'?'Sua empresa em uma visão simples.':'Informações organizadas para você decidir.'}</p></div><div className="master-chip">MASTER</div></header>

    {page==='inicio'&&<section className="content"><div className="hero"><div><span className="eyebrow">VISÃO DO MÊS</span><h2>Olá! Estes são os números que merecem sua atenção.</h2></div><button className="primary" onClick={()=>setPage('arquivos')}><Upload size={18}/>Atualizar dados</button></div><div className="kpis"><Kpi title="Saldo disponível" value={fmt(data.summary.balance)} sub="nas contas identificadas" icon={<WalletCards/>}/><Kpi title="Entradas" value={fmt(data.summary.inflow)} sub="no período" tone="good" icon={<ArrowUpRight/>}/><Kpi title="Saídas" value={fmt(data.summary.outflow)} sub="no período" tone="bad" icon={<ArrowDownRight/>}/><Kpi title="Nomes para ensinar" value={`${data.summary.pending} nomes`} sub="classifique uma vez" tone="warn" icon={<Users/>}/></div><div className="grid2"><div className="card"><div className="card-title"><div><small>EVOLUÇÃO</small><h3>Entradas mensais</h3></div><span>2026</span></div><MiniChart values={data.months}/></div><div className="card attention"><div className="card-title"><div><small>ATENÇÃO</small><h3>O que fazer agora</h3></div><Sparkles/></div><div className="todo"><CheckCircle2/><div><b>Arquivos processados</b><span>{data.files.length} fontes reconhecidas</span></div></div><div className="todo warn"><AlertTriangle/><div><b>{data.summary.pending} nomes para ensinar</b><span>Depois disso, o Claria lembra automaticamente.</span></div></div><button className="text-btn" onClick={()=>{setPage('lancamentos');setReviewMode(true)}}>Ensinar agora →</button></div></div></section>}

    {page==='arquivos'&&<section className="content"><div className="hero"><div><span className="eyebrow">FONTES DE DADOS</span><h2>Coloque os arquivos na pasta da empresa. O Claria organiza.</h2><p>PDF, Excel e CSV. O sistema tenta reconhecer o formato antes de pedir sua ajuda.</p></div></div><div className="upload-card"><div className="upload-icon"><FolderOpen/></div><div><h3>Pasta da empresa</h3><p>Escolha a pasta onde ficam extratos, vendas, compras e caixa.</p></div><div className="upload-actions"><button className="primary" onClick={()=>folderRef.current.click()} disabled={uploading}>{uploading?'Lendo...':'Escolher pasta'}</button><button className="secondary" onClick={()=>fileRef.current.click()}>Selecionar arquivos</button></div><input ref={folderRef} type="file" multiple webkitdirectory="" directory="" hidden onChange={e=>upload(e.target.files)}/><input ref={fileRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv" hidden onChange={e=>upload(e.target.files)}/></div><div className="card table-card"><div className="card-title"><div><small>ÚLTIMAS LEITURAS</small><h3>Arquivos reconhecidos</h3></div></div><div className="table">{data.files.map((f,i)=><div className="tr" key={i}><div className="file-name"><div className="file-dot">{f.name.split('.').pop().toUpperCase()}</div><div><b>{f.name}</b><span>{f.type}</span></div></div><span>{f.count} registros</span><span className={f.status==='Importado'?'badge ok':'badge review'}>{f.status}</span></div>)}</div></div></section>}

    {page==='lancamentos'&&<section className="content">
      <div className="hero compact-hero"><div><span className="eyebrow">CAIXA</span><h2>{reviewMode?'Ensinar o Claria':'Todos os lançamentos'}</h2><p>{reviewMode?'Classifique cada nome uma única vez. O Claria aplica no histórico e lembra nas próximas importações.':'Consulte os movimentos já organizados.'}</p></div><div className="segmented"><button className={reviewMode?'active':''} onClick={()=>setReviewMode(true)}>Ensinar</button><button className={!reviewMode?'active':''} onClick={()=>setReviewMode(false)}>Todos</button></div></div>
      {reviewMode?<>
        <div className="learning-banner"><div className="learning-icon"><Brain/></div><div><b>{groups.length?`Encontramos ${groups.length} ${groups.length===1?'nome novo':'nomes novos'}.`:'Tudo ensinado por enquanto.'}</b><span>{groups.length?'Confirme uma vez e não perguntaremos de novo para este mesmo nome e direção.':'Novos nomes aparecerão aqui quando você importar mais arquivos.'}</span></div></div>

        <div className="company-context card"><div><small>CONTEXTO PARA A LUNA</small>{editingCompany?<div className="context-edit"><input placeholder="Setor, ex.: Comércio" value={companyDraft.sector||''} onChange={e=>setCompanyDraft({...companyDraft,sector:e.target.value})}/><input placeholder="Atividade, ex.: cosméticos e produtos naturais" value={companyDraft.activity||''} onChange={e=>setCompanyDraft({...companyDraft,activity:e.target.value})}/></div>:<p><b>{data.company?.sector||'Setor não informado'}</b>{data.company?.activity?` · ${data.company.activity}`:''}</p>}</div><button className="secondary small" onClick={()=>editingCompany?saveCompany():setEditingCompany(true)}>{editingCompany?<><Save size={15}/>Salvar</>:<><Pencil size={15}/>Editar</>}</button></div>

        {likelyRevenue.length>1&&<div className="bulk-card"><div><div className="bulk-icon"><Users/></div><div><b>{likelyRevenue.length} nomes parecem ser clientes</b><span>São entradas recebidas e a sugestão é Receita de vendas. Transferências próprias devem ser alteradas antes de confirmar.</span></div></div><button className="primary" disabled={busy} onClick={confirmRevenueBatch}><Check size={17}/>Classificar {likelyRevenue.length} como Venda</button></div>}

        {unknownNegative.length>0&&<div className="luna-card"><div><WandSparkles/><div><b>{unknownNegative.length} favorecidos de saída ainda sem sugestão</b><span>A Luna analisa os nomes em lote usando o setor da empresa. Nenhuma sugestão vira regra até você confirmar.</span></div></div><button className="secondary" disabled={lunaBusy} onClick={askLuna}>{lunaBusy?'Analisando...':'Sugerir com Luna'}</button></div>}

        <div className="review-list">{groups.map(g=><ReviewCard key={`${g.direction}-${g.normalizedParty}`} g={g} categories={categories} onConfirm={confirmGroup} busy={busy}/>)}</div>
      </>:<>
        <div className="toolbar"><div className="search"><Search size={18}/><input placeholder="Buscar descrição ou categoria" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="card table-card"><div className="table tx-table"><div className="tr head"><b>Data</b><b>Descrição</b><b>Categoria</b><b>Valor</b></div>{tx.map(t=><div className="tr" key={t.id||`${t.date}-${t.description}`}><span>{t.date}</span><div><b>{t.description}</b><span>{t.status==='CONFIRMED'?'Aprendido':t.source==='AI'?'Sugestão da Luna':t.confidence>=90?'Automático':'Sugestão'}</span></div><span className="category">{t.category}</span><b className={t.amount>=0?'money in':'money out'}>{fmt(t.amount)}</b></div>)}</div></div>
      </>}
    </section>}

    {page==='conciliacao'&&<section className="content"><div className="hero"><div><span className="eyebrow">CONCILIAÇÃO</span><h2>O sistema cruza o que você vendeu com o que realmente entrou.</h2></div></div><div className="kpis"><Kpi title="Conciliados" value="86%" sub="automáticos" tone="good"/><Kpi title="Prováveis" value="9 itens" sub="confirmar correspondência" tone="warn"/><Kpi title="Sem par" value="3 itens" sub="precisam de atenção" tone="bad"/></div><div className="card"><div className="match"><div><small>VENDA / RECEBIMENTO</small><b>PagBank Crédito Mastercard</b><span>Venda bruta R$ 266,55 • taxa R$ 6,58</span></div><div className="match-line">→</div><div><small>BANCO</small><b>Recebimento líquido</b><span>R$ 259,97</span></div><span className="badge ok">Conciliado</span></div></div></section>}

    {page==='gestao'&&<section className="content"><div className="hero"><div><span className="eyebrow">GESTÃO</span><h2>Resultado em linguagem simples.</h2></div></div><div className="kpis"><Kpi title="Faturamento" value={fmt(data.summary.revenue)} sub="sem transferências próprias"/><Kpi title="Resultado operacional" value={fmt(data.summary.result)} sub="mês atual" tone={data.summary.result>=0?'good':'bad'}/><Kpi title="Margem de contribuição" value="55%" sub="último mês completo" tone="warn"/><Kpi title="Reserva estimada" value="R$ 17 mil" sub="referência do relatório"/></div><div className="grid2"><div className="card"><div className="card-title"><div><small>DRE RESUMIDA</small><h3>Como o resultado se forma</h3></div></div>{[['Receita bruta',data.summary.revenue],['(-) Saídas operacionais',-(data.summary.revenue-data.summary.result)],['Resultado',data.summary.result]].map((r,i)=><div className={'dre '+(i===2?'total':'')} key={i}><span>{r[0]}</span><b>{fmt(r[1])}</b></div>)}</div><div className="card attention"><div className="card-title"><div><small>LEITURA GERENCIAL</small><h3>Resumo</h3></div><Sparkles/></div><p>A base já separa transferências entre contas do faturamento e usa as classificações confirmadas para formar a leitura gerencial.</p><small>As sugestões da Luna só passam a ser memória da empresa depois da sua confirmação.</small></div></div></section>}
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<App/>)
