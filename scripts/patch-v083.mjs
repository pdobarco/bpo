import fs from 'node:fs'

const read=p=>fs.readFileSync(p,'utf8')
const write=(p,s)=>fs.writeFileSync(p,s)
const replaceIf=(src,from,to)=>{if(src.includes(to))return src;if(!src.includes(from))throw new Error(`text not found: ${from}`);return src.replace(from,to)}

let main=read('client/src/main.tsx')
main=replaceIf(main,"import{ReconciliationPageV080}from'./v080'","import{ReconciliationPageV083}from'./v083'")
main=main.replaceAll('ReconciliationPageV080','ReconciliationPageV083')
main=replaceIf(main,"const APP_VERSION='0.8.2'","const APP_VERSION='0.8.3'")
write('client/src/main.tsx',main)

let v080=read('server/src/v080.ts')
v080=replaceIf(v080,'async function autoReconcile(cid:string,from:string,to:string)','export async function autoReconcile(cid:string,from:string,to:string)')
v080=replaceIf(v080,
  "FROM payables p WHERE p.company_id=$1 AND p.payment_status<>'PAID' AND p.due_date BETWEEN $2::date-interval '15 days' AND $3::date+interval '15 days'",
  "FROM payables p WHERE p.company_id=$1 AND p.payment_status<>'PAID' AND p.origin_type<>'CREDIT_CARD_INSTALLMENT' AND p.due_date BETWEEN $2::date-interval '15 days' AND $3::date+interval '15 days'"
)
write('server/src/v080.ts',v080)

let v083=read('server/src/v083.ts')
v083=replaceIf(v083,
  "  const paidMap=new Map(settlements.rows.map((x:any)=>[`${x.source_file_id}|${iso(x.due_month)}`,x]))",
  "  const paidMap=new Map<string,any>();for(const x of settlements.rows)paidMap.set(`${x.source_file_id}|${iso(x.due_month)}`,x)"
)
v083=replaceIf(v083,'candidates}})}}','candidates}})}')
v083=replaceIf(v083,
  "      pool.query(`SELECT p.id,p.transaction_id,p.supplier party,p.description,p.issue_date,p.due_date,p.amount,p.payment_method,p.origin_type FROM payables p WHERE p.company_id=$1 AND p.payment_status<>'PAID' AND ((p.origin_type='CREDIT_CARD_INSTALLMENT' AND p.due_date BETWEEN $2::date AND $3::date) OR (p.origin_type<>'CREDIT_CARD_INSTALLMENT' AND p.competence_date BETWEEN $2::date AND $3::date)) ORDER BY p.due_date`,[req.companyId,from,to]),",
  "      pool.query(`SELECT p.id,p.transaction_id,p.supplier party,p.description,p.issue_date,p.due_date,p.amount,p.payment_method,p.origin_type FROM payables p WHERE p.company_id=$1 AND p.payment_status<>'PAID' AND p.origin_type<>'CREDIT_CARD_INSTALLMENT' AND p.competence_date BETWEEN $2::date AND $3::date ORDER BY p.due_date`,[req.companyId,from,to]),"
)
const oldTx=`  await pool!.query('BEGIN')
  try{
    await pool!.query(\`INSERT INTO card_invoice_settlements(company_id,source_file_id,due_month,total_amount,cash_transaction_id,status,matched_at,updated_at)
      VALUES($1,$2,$3::date,$4,$5,'PAID',now(),now())
      ON CONFLICT(company_id,source_file_id,due_month) DO UPDATE SET total_amount=excluded.total_amount,cash_transaction_id=excluded.cash_transaction_id,status='PAID',matched_at=now(),updated_at=now()\`,[cid,sourceFileId,dueMonth,total,cashId])
    await pool!.query(\`UPDATE payables SET payment_status='PAID',paid_amount=amount,paid_at=COALESCE(paid_at,$4::timestamptz),updated_at=now()
      WHERE company_id=$1 AND source_file_id=$2 AND origin_type='CREDIT_CARD_INSTALLMENT' AND date_trunc('month',due_date)::date=$3::date\`,[cid,sourceFileId,dueMonth,cashDate])
    for(const p of rows.rows){if(!p.transaction_id)continue;await pool!.query(\`INSERT INTO reconciliation_links(company_id,left_transaction_id,right_transaction_id,match_type,confidence)
      VALUES($1,$2,$3,$4,100) ON CONFLICT(company_id,left_transaction_id,right_transaction_id) DO UPDATE SET match_type=$4,confidence=100\`,[cid,p.transaction_id,cashId,matchType])}
    await pool!.query(\`UPDATE transactions SET category='Liquidação de cartão de crédito',account_id=$3,classification_status='CONFIRMED',classification_source='CARD_INVOICE_V083',dre_impact=false,cash_impact=true,accounting_role='CASH_MOVEMENT',financial_status='PAID'
      WHERE id=$1 AND company_id=$2\`,[cashId,cid,acc.rows[0]?.id||null])
    await pool!.query('COMMIT')
  }catch(e){await pool!.query('ROLLBACK');throw e}`
const newTx=`  const client=await pool!.connect()
  try{
    await client.query('BEGIN')
    await client.query(\`INSERT INTO card_invoice_settlements(company_id,source_file_id,due_month,total_amount,cash_transaction_id,status,matched_at,updated_at)
      VALUES($1,$2,$3::date,$4,$5,'PAID',now(),now())
      ON CONFLICT(company_id,source_file_id,due_month) DO UPDATE SET total_amount=excluded.total_amount,cash_transaction_id=excluded.cash_transaction_id,status='PAID',matched_at=now(),updated_at=now()\`,[cid,sourceFileId,dueMonth,total,cashId])
    await client.query(\`UPDATE payables SET payment_status='PAID',paid_amount=amount,paid_at=COALESCE(paid_at,$4::timestamptz),updated_at=now()
      WHERE company_id=$1 AND source_file_id=$2 AND origin_type='CREDIT_CARD_INSTALLMENT' AND date_trunc('month',due_date)::date=$3::date\`,[cid,sourceFileId,dueMonth,cashDate])
    for(const p of rows.rows){if(!p.transaction_id)continue;await client.query(\`INSERT INTO reconciliation_links(company_id,left_transaction_id,right_transaction_id,match_type,confidence)
      VALUES($1,$2,$3,$4,100) ON CONFLICT(company_id,left_transaction_id,right_transaction_id) DO UPDATE SET match_type=$4,confidence=100\`,[cid,p.transaction_id,cashId,matchType])}
    await client.query(\`UPDATE transactions SET category='Liquidação de cartão de crédito',account_id=$3,classification_status='CONFIRMED',classification_source='CARD_INVOICE_V083',dre_impact=false,cash_impact=true,accounting_role='CASH_MOVEMENT',financial_status='PAID'
      WHERE id=$1 AND company_id=$2\`,[cashId,cid,acc.rows[0]?.id||null])
    await client.query('COMMIT')
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}`
v083=replaceIf(v083,oldTx,newTx)
write('server/src/v083.ts',v083)

let server=read('server/src/index.ts')
server=replaceIf(server,"import { registerV082Routes } from './v082.js'","import { registerV082Routes } from './v082.js'\nimport { registerV083Routes,initV083Schema } from './v083.js'")
server=replaceIf(server,'registerV082Routes(app)','registerV082Routes(app)\nregisterV083Routes(app)')
server=replaceIf(server,'  await initV080Schema()','  await initV080Schema()\n  await initV083Schema()')
server=server.replaceAll("version:'0.8.0'","version:'0.8.3'")
write('server/src/index.ts',server)

for(const p of ['package.json','client/package.json','server/package.json','client/package-lock.json','server/package-lock.json']){
  let s=read(p)
  s=s.replaceAll('"version": "0.8.2"','"version": "0.8.3"')
  write(p,s)
}

console.log('v0.8.3 integration applied')
