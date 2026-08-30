import {pool} from './db.js'
import {autoReconcile} from './v080.js'

const n=(v:any)=>Number(v||0)
const pad=(v:any)=>String(v).padStart(2,'0')
const iso=(v:any)=>{if(!v)return null;if(v instanceof Date&&!Number.isNaN(v.getTime()))return`${v.getFullYear()}-${pad(v.getMonth()+1)}-${pad(v.getDate())}`;const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:null}
const monthStart=(v:any)=>{const d=iso(v);return d?`${d.slice(0,7)}-01`:null}
const periodBounds=(raw:any)=>{const period=/^\d{4}-\d{2}$/.test(String(raw||''))?String(raw):new Date().toISOString().slice(0,7),[y,m]=period.split('-').map(Number);return{period,from:`${period}-01`,to:`${period}-${pad(new Date(y,m,0).getDate())}`,month:`${period}-01`}}
const cardHint=(v:any)=>/(FATURA|CART[AÃ]O|CREDITO|CR[EÉ]DITO|PAGAMENTO.{0,20}CART)/i.test(String(v||''))

async function invoiceRows(cid:string,dueMonth:string,sourceFileId:string){return pool!.query(`SELECT p.id,p.transaction_id,p.amount,p.due_date,p.payment_status,p.paid_at
  FROM payables p
  WHERE p.company_id=$1 AND p.source_file_id=$2 AND p.origin_type='CREDIT_CARD_INSTALLMENT'
    AND date_trunc('month',p.due_date)::date=$3::date
  ORDER BY p.due_date,p.id`,[cid,sourceFileId,dueMonth])}

async function settleCardInvoice(cid:string,sourceFileId:string,dueMonth:string,cashId:string,matchType='CARD_INVOICE_TOTAL_MANUAL'){
  const rows=await invoiceRows(cid,dueMonth,sourceFileId)
  if(!rows.rowCount)throw new Error('Nenhum lançamento desta fatura foi encontrado para o mês informado.')
  const total=rows.rows.reduce((a:number,x:any)=>a+n(x.amount),0)
  const cash=await pool!.query(`SELECT id,occurred_at,competence_at,direction,amount,description,category,accounting_role FROM transactions
    WHERE id=$1 AND company_id=$2 AND accounting_role IN ('CASH_MOVEMENT','DIRECT_BANK_EXPENSE') LIMIT 1`,[cashId,cid])
  if(!cash.rowCount)throw new Error('Pagamento bancário não encontrado ou já não está disponível para conciliação.')
  const c=cash.rows[0],cashDate=iso(c.occurred_at||c.competence_at),cashMonth=monthStart(cashDate)
  if(c.direction!=='SAIDA')throw new Error('O pagamento da fatura precisa ser uma saída bancária.')
  if(Math.abs(Math.abs(n(c.amount))-total)>0.02)throw new Error(`O pagamento bancário não fecha com o total da fatura (${total.toFixed(2)}).`)
  if(cashMonth!==dueMonth)throw new Error('O pagamento bancário precisa pertencer ao mesmo mês de vencimento da fatura.')
  const acc=await pool!.query(`SELECT id FROM chart_accounts WHERE company_id=$1 AND active=true AND lower(name)=lower('Liquidação de cartão de crédito') LIMIT 1`,[cid])
  const client=await pool!.connect()
  try{
    await client.query('BEGIN')
    await client.query(`INSERT INTO card_invoice_settlements(company_id,source_file_id,due_month,total_amount,cash_transaction_id,status,matched_at,updated_at)
      VALUES($1,$2,$3::date,$4,$5,'PAID',now(),now())
      ON CONFLICT(company_id,source_file_id,due_month) DO UPDATE SET total_amount=excluded.total_amount,cash_transaction_id=excluded.cash_transaction_id,status='PAID',matched_at=now(),updated_at=now()`,[cid,sourceFileId,dueMonth,total,cashId])
    await client.query(`UPDATE payables SET payment_status='PAID',paid_amount=amount,paid_at=COALESCE(paid_at,$4::timestamptz),updated_at=now()
      WHERE company_id=$1 AND source_file_id=$2 AND origin_type='CREDIT_CARD_INSTALLMENT' AND date_trunc('month',due_date)::date=$3::date`,[cid,sourceFileId,dueMonth,cashDate])
    for(const p of rows.rows){if(!p.transaction_id)continue;await client.query(`INSERT INTO reconciliation_links(company_id,left_transaction_id,right_transaction_id,match_type,confidence)
      VALUES($1,$2,$3,$4,100) ON CONFLICT(company_id,left_transaction_id,right_transaction_id) DO UPDATE SET match_type=$4,confidence=100`,[cid,p.transaction_id,cashId,matchType])}
    await client.query(`UPDATE transactions SET category='Liquidação de cartão de crédito',account_id=$3,classification_status='CONFIRMED',classification_source='CARD_INVOICE_V083',dre_impact=false,cash_impact=true,accounting_role='CASH_MOVEMENT',financial_status='PAID'
      WHERE id=$1 AND company_id=$2`,[cashId,cid,acc.rows[0]?.id||null])
    await client.query('COMMIT')
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  return{sourceFileId,dueMonth,total,itemCount:rows.rowCount,cashId,cashDate}
}

async function getCardInvoiceGroups(cid:string,period:string,auto=true){const{month}=periodBounds(period)
  const groups=await pool!.query(`SELECT p.source_file_id,sf.name source_name,date_trunc('month',p.due_date)::date due_month,min(p.due_date) first_due,max(p.due_date) last_due,
      count(*)::int item_count,sum(p.amount)::numeric total_amount,count(*) FILTER(WHERE p.payment_status='PAID')::int paid_count
    FROM payables p JOIN source_files sf ON sf.id=p.source_file_id AND sf.company_id=p.company_id
    WHERE p.company_id=$1 AND p.origin_type='CREDIT_CARD_INSTALLMENT' AND date_trunc('month',p.due_date)::date=$2::date
    GROUP BY p.source_file_id,sf.name,date_trunc('month',p.due_date)::date ORDER BY sf.name`,[cid,month])
  const cash=await pool!.query(`SELECT t.id,t.occurred_at,t.competence_at,t.description,t.amount,t.category,t.accounting_role
    FROM transactions t
    WHERE t.company_id=$1 AND t.direction='SAIDA' AND t.accounting_role IN ('CASH_MOVEMENT','DIRECT_BANK_EXPENSE')
      AND date_trunc('month',COALESCE(t.competence_at,t.occurred_at)::date)::date=$2::date
      AND NOT EXISTS(SELECT 1 FROM reconciliation_ignores ri WHERE ri.company_id=$1 AND ri.transaction_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM reconciliation_links rl WHERE rl.company_id=$1 AND (rl.left_transaction_id=t.id OR rl.right_transaction_id=t.id))
    ORDER BY COALESCE(t.competence_at,t.occurred_at),t.id`,[cid,month])
  let autoMatched=0
  if(auto){for(const g of groups.rows){if(n(g.paid_count)>=n(g.item_count))continue;const total=n(g.total_amount),exact=cash.rows.filter((c:any)=>Math.abs(Math.abs(n(c.amount))-total)<=0.02),hinted=exact.filter((c:any)=>cardHint(`${c.description} ${c.category}`));if(hinted.length===1){await settleCardInvoice(cid,g.source_file_id,iso(g.due_month)!,hinted[0].id,'CARD_INVOICE_TOTAL_AUTO');autoMatched++;cash.rows.splice(cash.rows.findIndex((x:any)=>x.id===hinted[0].id),1)}}}
  const settlements=await pool!.query(`SELECT source_file_id,due_month,total_amount,cash_transaction_id,status,matched_at FROM card_invoice_settlements WHERE company_id=$1 AND due_month=$2::date`,[cid,month])
  const paidMap=new Map<string,any>();for(const x of settlements.rows)paidMap.set(`${x.source_file_id}|${iso(x.due_month)}`,x)
  return{autoMatched,groups:groups.rows.map((g:any)=>{const key=`${g.source_file_id}|${iso(g.due_month)}`,s:any=paidMap.get(key),paid=n(g.paid_count)>=n(g.item_count)||s?.status==='PAID',candidates=paid?[]:cash.rows.filter((c:any)=>Math.abs(Math.abs(n(c.amount))-n(g.total_amount))<=0.02).map((c:any)=>({id:c.id,date:iso(c.competence_at||c.occurred_at),description:c.description,amount:Math.abs(n(c.amount)),hint:cardHint(`${c.description} ${c.category}`)}));return{sourceFileId:g.source_file_id,sourceName:g.source_name,dueMonth:iso(g.due_month),firstDue:iso(g.first_due),lastDue:iso(g.last_due),itemCount:n(g.item_count),total:n(g.total_amount),status:paid?'PAID':'OPEN',matchedAt:s?.matched_at||null,cashTransactionId:s?.cash_transaction_id||null,candidates}})}}
}

export async function initV083Schema(){if(!pool)return false
  await pool.query(`CREATE TABLE IF NOT EXISTS card_invoice_settlements(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    source_file_id UUID REFERENCES source_files(id) ON DELETE CASCADE,due_month DATE NOT NULL,total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    cash_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,status TEXT NOT NULL DEFAULT 'OPEN',matched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now(),UNIQUE(company_id,source_file_id,due_month))`)
  try{await pool.query(`INSERT INTO schema_meta(key,value) VALUES('schema_version','0.8.3') ON CONFLICT(key) DO UPDATE SET value='0.8.3'`)}catch{}
  return true
}

export function registerV083Routes(app:any){
  app.get('/api/reconciliation-v083',async(req:any,res:any)=>{if(!pool)return res.json({matches:[],openReceivables:[],openPayables:[],unmatchedCash:[],cardInvoices:[],summary:{}});const{period,from,to}=periodBounds(req.query?.period),card=await getCardInvoiceGroups(req.companyId,period,true),autoMatched=await autoReconcile(req.companyId,from,to),[links,openRec,openPay,unmatchedCash]=await Promise.all([
      pool.query(`SELECT rl.id,rl.match_type,rl.confidence,l.description left_description,l.amount left_amount,r.description right_description,r.amount right_amount FROM reconciliation_links rl JOIN transactions l ON l.id=rl.left_transaction_id JOIN transactions r ON r.id=rl.right_transaction_id WHERE rl.company_id=$1 AND rl.match_type NOT LIKE 'CARD_INVOICE_TOTAL%' AND (l.competence_at BETWEEN $2::date AND $3::date OR r.competence_at BETWEEN $2::date AND $3::date) ORDER BY rl.created_at DESC LIMIT 80`,[req.companyId,from,to]),
      pool.query(`SELECT r.id,r.transaction_id,r.customer party,r.description,r.issue_date,r.due_date,r.amount,r.payment_method FROM receivables r WHERE r.company_id=$1 AND r.receipt_status<>'RECEIVED' AND r.competence_date BETWEEN $2::date AND $3::date ORDER BY r.issue_date`,[req.companyId,from,to]),
      pool.query(`SELECT p.id,p.transaction_id,p.supplier party,p.description,p.issue_date,p.due_date,p.amount,p.payment_method,p.origin_type FROM payables p WHERE p.company_id=$1 AND p.payment_status<>'PAID' AND p.origin_type<>'CREDIT_CARD_INSTALLMENT' AND p.competence_date BETWEEN $2::date AND $3::date ORDER BY p.due_date`,[req.companyId,from,to]),
      pool.query(`SELECT t.id,t.source_file_id,t.description,t.normalized_party,t.competence_at,t.direction,t.amount,t.category,t.account_id,t.classification_status,t.payment_method,sf.validation->>'holderName' holder_name FROM transactions t LEFT JOIN source_files sf ON sf.id=t.source_file_id WHERE t.company_id=$1 AND t.accounting_role='CASH_MOVEMENT' AND t.competence_at BETWEEN $2::date AND $3::date AND NOT EXISTS(SELECT 1 FROM reconciliation_links rl WHERE rl.company_id=$1 AND (rl.left_transaction_id=t.id OR rl.right_transaction_id=t.id)) AND NOT EXISTS(SELECT 1 FROM reconciliation_ignores ri WHERE ri.company_id=$1 AND ri.transaction_id=t.id) ORDER BY t.competence_at`,[req.companyId,from,to])])
    res.json({period,autoMatched:autoMatched+card.autoMatched,cardAutoMatched:card.autoMatched,matches:links.rows,openReceivables:openRec.rows,openPayables:openPay.rows,unmatchedCash:unmatchedCash.rows,cardInvoices:card.groups,summary:{matched:links.rowCount,receivable:openRec.rowCount,payable:openPay.rowCount,cash:unmatchedCash.rowCount,cardInvoicesOpen:card.groups.filter((x:any)=>x.status!=='PAID').length}})
  })

  app.post('/api/reconciliation-v083/card-invoice-settle',async(req:any,res:any)=>{try{const b=req.body||{};if(!b.sourceFileId||!b.dueMonth||!b.cashId)return res.status(400).json({message:'Informe a fatura e o pagamento bancário.'});const out=await settleCardInvoice(req.companyId,String(b.sourceFileId),String(b.dueMonth),String(b.cashId));res.json({ok:true,...out})}catch(e:any){res.status(400).json({message:e?.message||String(e)})}})

  app.post('/api/reconciliation-v083/batch-classify',async(req:any,res:any)=>{const ids=[...new Set((req.body?.transactionIds||[]).map(String))].slice(0,500),accountId=String(req.body?.accountId||'');if(!ids.length||!accountId)return res.status(400).json({message:'Selecione os lançamentos e o plano de contas.'});const account=await pool!.query(`SELECT id,name,dre_section FROM chart_accounts WHERE id=$1 AND company_id=$2 AND active=true AND is_group=false LIMIT 1`,[accountId,req.companyId]);if(!account.rowCount)return res.status(400).json({message:'Plano de contas inválido.'});const txs=await pool!.query(`SELECT id,direction FROM transactions WHERE company_id=$1 AND id=ANY($2::uuid[]) AND accounting_role='CASH_MOVEMENT'`,[req.companyId,ids]);if(txs.rowCount!==ids.length)return res.status(400).json({message:'Há lançamentos selecionados que já foram resolvidos. Atualize a tela e tente novamente.'});const dirs=[...new Set(txs.rows.map((x:any)=>x.direction))];if(dirs.length!==1)return res.status(400).json({message:'Para classificar em lote, selecione somente entradas ou somente saídas.'});const a=account.rows[0],dre=a.dre_section!=='FORA_DRE',role=dirs[0]==='ENTRADA'?'DIRECT_BANK_INCOME':'DIRECT_BANK_EXPENSE';await pool!.query(`UPDATE transactions SET category=$3,account_id=$4,classification_status='CONFIRMED',classification_source='BATCH_V083',dre_impact=$5,cash_impact=true,accounting_role=$6 WHERE company_id=$1 AND id=ANY($2::uuid[])`,[req.companyId,ids,a.name,a.id,dre,role]);res.json({ok:true,count:ids.length,category:a.name})})

  app.post('/api/reconciliation-v083/batch-transfer',async(req:any,res:any)=>{const ids=[...new Set((req.body?.transactionIds||[]).map(String))].slice(0,500);if(!ids.length)return res.status(400).json({message:'Selecione os lançamentos.'});const acc=await pool!.query(`SELECT id FROM chart_accounts WHERE company_id=$1 AND active=true AND lower(name)=lower('Transferência entre contas próprias') LIMIT 1`,[req.companyId]);const r=await pool!.query(`UPDATE transactions SET category='Transferência entre contas próprias',account_id=$3,classification_status='CONFIRMED',classification_source='BATCH_TRANSFER_V083',dre_impact=false,cash_impact=true,accounting_role='TRANSFER' WHERE company_id=$1 AND id=ANY($2::uuid[]) AND accounting_role='CASH_MOVEMENT' RETURNING id`,[req.companyId,ids,acc.rows[0]?.id||null]);res.json({ok:true,count:r.rowCount})})

  app.post('/api/reconciliation-v083/batch-ignore',async(req:any,res:any)=>{const ids=[...new Set((req.body?.transactionIds||[]).map(String))].slice(0,500);if(!ids.length)return res.status(400).json({message:'Selecione os lançamentos.'});for(const id of ids)await pool!.query(`INSERT INTO reconciliation_ignores(company_id,transaction_id,reason) VALUES($1,$2,'Ignorado em lote na conciliação v0.8.3') ON CONFLICT(company_id,transaction_id) DO UPDATE SET reason=excluded.reason`,[req.companyId,id]);res.json({ok:true,count:ids.length})})
}
