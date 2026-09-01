import {pool} from './db.js'

const n=(v:any)=>Number(v||0)
const pad=(v:any)=>String(v).padStart(2,'0')

function periodRange(raw:any){
  const period=/^\d{4}-\d{2}$/.test(String(raw||''))?String(raw):new Date().toISOString().slice(0,7)
  const[y,m]=period.split('-').map(Number)
  return{period,from:`${period}-01`,to:`${period}-${pad(new Date(y,m,0).getDate())}`}
}

function filterSql(cid:string,body:any){
  const range=periodRange(body?.period),params:any[]=[cid,range.from,range.to]
  const effective=`COALESCE(t.competence_at,t.occurred_at::date)`
  const where=[`t.company_id=$1`,`${effective} BETWEEN $2::date AND $3::date`]
  const add=(clause:string,value:any)=>{params.push(value);where.push(clause.replace('?',`$${params.length}`))}
  if(body?.q){const q=`%${String(body.q).trim()}%`;params.push(q,q,q,q);where.push(`(t.description ILIKE $${params.length-3} OR COALESCE(t.custom_title,'') ILIKE $${params.length-2} OR COALESCE(t.category,'') ILIKE $${params.length-1} OR COALESCE(t.normalized_party,'') ILIKE $${params.length})`)}
  if(body?.direction)add(`t.direction=?`,body.direction)
  if(body?.category)add(`t.category=?`,body.category)
  if(body?.paymentMethod)add(`t.payment_method=?`,body.paymentMethod)
  if(body?.status)add(`t.financial_status=?`,body.status)
  if(body?.classification==='PENDING')where.push(`t.accounting_role NOT IN ('RECEIVABLE_CONTROL','PAYABLE_CONTROL','CARD_EVIDENCE') AND (t.classification_status IN ('PENDING','SUGGESTED') OR t.category IS NULL OR t.category='A classificar' OR (t.accounting_role='CASH_MOVEMENT' AND NOT EXISTS(SELECT 1 FROM reconciliation_links rl WHERE rl.company_id=t.company_id AND (rl.left_transaction_id=t.id OR rl.right_transaction_id=t.id)) AND NOT EXISTS(SELECT 1 FROM reconciliation_ignores ri WHERE ri.company_id=t.company_id AND ri.transaction_id=t.id)))`)
  if(body?.classification==='CONFIRMED')where.push(`t.classification_status IN ('CONFIRMED','AUTO') AND t.accounting_role NOT IN ('CASH_MOVEMENT','RECEIVABLE_CONTROL','PAYABLE_CONTROL','CARD_EVIDENCE')`)
  where.push(`NOT EXISTS(SELECT 1 FROM period_closures pc WHERE pc.company_id=t.company_id AND pc.period_key=to_char(${effective},'YYYY-MM') AND pc.status='CLOSED')`)
  return{range,params,where,effective}
}

async function applyFreightHeuristic(){
  if(!pool)return
  await pool.query(`UPDATE transactions t SET category=a.name,account_id=a.id,classification_confidence=98,classification_status='CONFIRMED',classification_source='HEURISTIC_FREIGHT_V086',dre_impact=true,accounting_role=CASE WHEN t.accounting_role='CASH_MOVEMENT' THEN 'DIRECT_BANK_EXPENSE' ELSE t.accounting_role END
    FROM chart_accounts a
    WHERE a.company_id=t.company_id AND a.active=true AND a.is_group=false AND lower(a.name)=lower('Fretes e entregas')
      AND t.direction='SAIDA' AND (t.classification_status IN ('PENDING','SUGGESTED') OR t.account_id IS NULL OR t.category IS NULL OR t.category='A classificar')
      AND (COALESCE(t.normalized_party,'') ~* '(SUPER[[:space:]]*FRETES|MELHOR[[:space:]]*ENVIO|CORREIOS|JADLOG|LOGGI|TRANSPORTADORA|FRETE)' OR COALESCE(t.description,'') ~* '(SUPER[[:space:]]*FRETES|MELHOR[[:space:]]*ENVIO|CORREIOS|JADLOG|LOGGI|TRANSPORTADORA|FRETE)')
      AND NOT EXISTS(SELECT 1 FROM period_closures pc WHERE pc.company_id=t.company_id AND pc.period_key=to_char(COALESCE(t.competence_at,t.occurred_at::date),'YYYY-MM') AND pc.status='CLOSED')`)
  await pool.query(`UPDATE payables p SET category=a.name,account_id=a.id,classification_status='CONFIRMED',updated_at=now()
    FROM chart_accounts a
    WHERE a.company_id=p.company_id AND a.active=true AND a.is_group=false AND lower(a.name)=lower('Fretes e entregas')
      AND (p.classification_status IS NULL OR p.classification_status IN ('PENDING','SUGGESTED') OR p.account_id IS NULL OR p.category IS NULL OR p.category='A classificar')
      AND (COALESCE(p.supplier,'') ~* '(SUPER[[:space:]]*FRETES|MELHOR[[:space:]]*ENVIO|CORREIOS|JADLOG|LOGGI|TRANSPORTADORA|FRETE)' OR COALESCE(p.description,'') ~* '(SUPER[[:space:]]*FRETES|MELHOR[[:space:]]*ENVIO|CORREIOS|JADLOG|LOGGI|TRANSPORTADORA|FRETE)')`)
}

export async function initV086Schema(){
  if(!pool)return false
  await applyFreightHeuristic()
  try{await pool.query(`INSERT INTO schema_meta(key,value) VALUES('schema_version','0.8.6') ON CONFLICT(key) DO UPDATE SET value='0.8.6'`)}catch{}
  return true
}

export function registerV086Routes(app:any){
  app.post('/api/transactions/classify-filtered',async(req:any,res:any)=>{
    if(!pool)return res.status(503).json({message:'Banco não configurado'})
    const cid=req.companyId,body=req.body||{},accountId=String(body.accountId||'')
    if(!accountId)return res.status(400).json({message:'Selecione o Plano de Contas.'})
    const account=await pool.query(`SELECT id,name,dre_section FROM chart_accounts WHERE id=$1 AND company_id=$2 AND active=true AND is_group=false LIMIT 1`,[accountId,cid])
    if(!account.rowCount)return res.status(400).json({message:'Plano de Contas inválido.'})
    const a=account.rows[0],f=filterSql(cid,body)
    const total=await pool.query(`SELECT count(*)::int n FROM transactions t LEFT JOIN source_files sf ON sf.id=t.source_file_id WHERE ${f.where.join(' AND ')}`,f.params)
    const count=n(total.rows[0]?.n)
    if(!count)return res.status(400).json({message:'Nenhum lançamento corresponde aos filtros atuais.'})
    if(count>5000)return res.status(400).json({message:`O filtro retornou ${count} lançamentos. Refine a pesquisa para alterar no máximo 5.000 por vez.`})
    const rows=await pool.query(`SELECT t.id,t.normalized_party,t.counterparty_document,t.direction,t.accounting_role FROM transactions t LEFT JOIN source_files sf ON sf.id=t.source_file_id WHERE ${f.where.join(' AND ')}`,f.params)
    const ids=rows.rows.map((x:any)=>x.id),dreImpact=a.dre_section!=='FORA_DRE'
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      await client.query(`UPDATE transactions SET category=$3,account_id=$4,classification_confidence=100,classification_status='CONFIRMED',classification_source='FILTER_BULK_V086',dre_impact=$5,accounting_role=CASE WHEN accounting_role='CASH_MOVEMENT' AND $3='Transferência entre contas próprias' THEN 'TRANSFER' WHEN accounting_role='CASH_MOVEMENT' AND $3='Liquidação de cartão de crédito' THEN 'CARD_SETTLEMENT' WHEN accounting_role='CASH_MOVEMENT' AND direction='ENTRADA' THEN 'DIRECT_BANK_INCOME' WHEN accounting_role='CASH_MOVEMENT' AND direction='SAIDA' THEN 'DIRECT_BANK_EXPENSE' ELSE accounting_role END WHERE company_id=$1 AND id=ANY($2::uuid[])`,[cid,ids,a.name,a.id,dreImpact])
      await client.query(`UPDATE payables SET category=$3,account_id=$4,classification_status='CONFIRMED',updated_at=now() WHERE company_id=$1 AND transaction_id=ANY($2::uuid[])`,[cid,ids,a.name,a.id])
      const unique=new Map<string,any>()
      for(const row of rows.rows){const party=String(row.normalized_party||'').trim().toUpperCase();if(!party)continue;unique.set(`${row.direction}|${party}`,{party,direction:row.direction,document:row.counterparty_document||null})}
      for(const item of unique.values()){
        await client.query(`DELETE FROM classification_rules WHERE scope='COMPANY' AND company_id=$1 AND normalized_party=$2 AND direction=$3`,[cid,item.party,item.direction])
        await client.query(`INSERT INTO classification_rules(scope,company_id,pattern,normalized_party,entity_document,direction,category,account_id,confidence,source) VALUES('COMPANY',$1,$2,$2,$3,$4,$5,$6,100,'FILTER_BULK_V086')`,[cid,item.party,item.document,item.direction,a.name,a.id])
      }
      await client.query('COMMIT')
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    res.json({ok:true,updated:ids.length,category:a.name,learnedSuppliers:new Set(rows.rows.map((x:any)=>String(x.normalized_party||'').trim()).filter(Boolean)).size})
  })
}
