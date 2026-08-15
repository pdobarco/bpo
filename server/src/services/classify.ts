import { pool, getCompanyAccounts, findAccountByName } from '../db.js'
import { accountMatchesDescription, extractDocument, extractParty, normalize, isIncomingTransfer, isOutgoingTransfer } from './entity.js'

async function resultWithAccount(companyId,result,party,document){
  const account=result.account_id?{id:result.account_id}:await findAccountByName(companyId,result.category)
  return {...result,normalized_party:result.normalized_party||party,counterparty_document:document||null,account_id:account?.id||null}
}

export async function classify(transaction,companyId,company=null){
  const description=transaction?.description||'',txt=normalize(description)
  const direction=transaction?.direction||(Number(transaction?.amount)>=0?'ENTRADA':'SAIDA')
  const party=extractParty(description),document=extractDocument(description),source=transaction?.raw?.source||''

  // Regras estruturais com evidência forte vêm antes da memória.
  if(source==='pagbank_statement'&&direction==='ENTRADA'&&/^VENDAS\s*-?\s*DISPONIVEL/i.test(txt)){
    return resultWithAccount(companyId,{category:'Receita de vendas',confidence:99,scope:null,source:'PARSER',status:'AUTO'},party,document)
  }
  if(source==='pagbank_sales') return resultWithAccount(companyId,{category:'Receita de vendas',confidence:100,scope:null,source:'PARSER',status:'AUTO'},party,document)
  if(source==='nubank_card') return resultWithAccount(companyId,{category:'A classificar',confidence:0,scope:null,source:null,status:'PENDING'},party,document)
  if(/^PAGAMENTO DE FATURA/.test(txt)) return resultWithAccount(companyId,{category:'Liquidação de cartão de crédito',confidence:100,scope:null,source:'PARSER',status:'AUTO'},party,document)

  if(pool){
    const exact=await pool.query(`SELECT category,normalized_party,entity_document,confidence,scope,source,account_id FROM classification_rules
      WHERE company_id=$1 AND scope='COMPANY' AND (normalized_party=$2 OR ($4 IS NOT NULL AND entity_document=$4))
      AND (direction=$3 OR direction='ANY') ORDER BY CASE WHEN direction=$3 THEN 0 ELSE 1 END,confidence DESC LIMIT 1`,[companyId,party,direction,document])
    if(exact.rowCount)return resultWithAccount(companyId,{...exact.rows[0],status:'CONFIRMED'},party,document)

    if(isIncomingTransfer(description)||isOutgoingTransfer(description)){
      const accounts=await getCompanyAccounts(companyId),ownDocument=String(company?.document||'').replace(/\D/g,''),descDigits=String(description).replace(/\D/g,''),ownName=normalize(company?.name||'')
      const ownByDocument=ownDocument.length>=8&&descDigits.includes(ownDocument),ownByName=ownName.length>=6&&txt.includes(ownName),ownByAccount=accounts.some(a=>accountMatchesDescription(a,description))
      if(ownByDocument||ownByName||ownByAccount)return resultWithAccount(companyId,{category:'Transferência entre contas próprias',confidence:99,scope:'COMPANY',source:'HEURISTIC',status:'AUTO'},party,document)
    }

    const global=await pool.query(`SELECT category,normalized_party,entity_document,confidence,confirmation_count,scope,source FROM classification_rules
      WHERE scope='GLOBAL' AND (direction=$2 OR direction='ANY') AND (($3 IS NOT NULL AND entity_document=$3) OR $1 LIKE '%'||pattern||'%')
      ORDER BY CASE WHEN $3 IS NOT NULL AND entity_document=$3 THEN 0 ELSE 1 END,confidence DESC,confirmation_count DESC,length(pattern) DESC LIMIT 1`,[txt,direction,document])
    if(global.rowCount){const g=global.rows[0],status=Number(g.confidence)>=95||Number(g.confirmation_count)>=3?'AUTO':'SUGGESTED';return resultWithAccount(companyId,{...g,status},party,document)}
  }

  if(direction==='ENTRADA'&&isIncomingTransfer(description))return resultWithAccount(companyId,{category:'Receita de vendas',confidence:78,scope:null,source:'HEURISTIC',status:'SUGGESTED'},party,document)
  return {category:'A classificar',normalized_party:party,counterparty_document:document,account_id:null,confidence:0,scope:null,source:null,status:'PENDING'}
}
