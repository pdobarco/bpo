import pdf from 'pdf-parse'

const MONTHS={JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12}
const money=s=>{if(s===null||s===undefined||s==='')return null;let n=String(s).replace(/R\$/gi,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.');const neg=n.includes('-');n=n.replace(/[^0-9.]/g,'');const v=Number(n||0);return neg?-v:v}
const brDate=d=>{const [a,b,c]=d.split('/');return new Date(`${c}-${b}-${a}T12:00:00-03:00`)}
const isoDate=d=>d?new Date(`${d}T12:00:00-03:00`):null
const dedupe=arr=>{const s=new Set;return arr.filter(x=>{const id=String(x.externalId||'').trim();if(!id)return true;if(s.has(id))return false;s.add(id);return true})}

function paymentMethod(desc=''){
  const t=desc.toUpperCase()
  if(t.includes('PIX'))return 'PIX'
  if(t.includes('CRÉDITO')||t.includes('CREDITO'))return 'Cartão de crédito'
  if(t.includes('DÉBITO')||t.includes('DEBITO'))return 'Cartão de débito'
  if(t.includes('BOLETO'))return 'Boleto'
  if(t.includes('TRANSFER'))return 'Transferência'
  return null
}

function parsePeriod(text){
  const a=text.match(/(?:PER[IÍ]ODO[:\s]*|)(\d{2}\/\d{2}\/\d{4})\s+(?:A|a|-|AT[EÉ])\s+(\d{2}\/\d{2}\/\d{4})/i)
  if(a)return {start:a[1].split('/').reverse().join('-'),end:a[2].split('/').reverse().join('-')}
  const b=text.match(/(\d{2})\s+DE\s+(JANEIRO|FEVEREIRO|MARÇO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(\d{4})\s+a\s+(\d{2})\s+DE\s+\2\s+DE\s+\3/i)
  if(b){const map={JANEIRO:1,FEVEREIRO:2,'MARÇO':3,MARCO:3,ABRIL:4,MAIO:5,JUNHO:6,JULHO:7,AGOSTO:8,SETEMBRO:9,OUTUBRO:10,NOVEMBRO:11,DEZEMBRO:12};const m=map[b[2].toUpperCase()];return{start:`${b[3]}-${String(m).padStart(2,'0')}-${b[1]}`,end:`${b[3]}-${String(m).padStart(2,'0')}-${b[4]}`}}
  return {start:null,end:null}
}

export function detectPdf(text){
  const t=text.toUpperCase()
  if(t.includes('RELATÓRIO DE VENDAS')&&t.includes('CÓDIGO NSU'))return 'PAGBANK_SALES'
  if(t.includes('EXTRATO DA CONTA')&&(t.includes('PAGSEGURO')||t.includes('PAGBANK')))return 'PAGBANK_STATEMENT'
  if(t.includes('SALDO FINAL DO PERÍODO')&&t.includes('MOVIMENTAÇÕES'))return 'NUBANK_STATEMENT'
  if(t.includes('FATURA')&&t.includes('TRANSAÇÕES DE'))return 'NUBANK_CARD'
  return 'GENERIC_PDF'
}

function parsePagBankStatement(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[]
  for(let i=0;i<lines.length;i++){
    const inline=lines[i].match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?R\$\s?[\d.]+,\d{2})$/)
    if(inline){
      const desc=inline[2];if(/saldo do dia/i.test(desc))continue
      const amount=money(inline[3]);out.push({occurredAt:brDate(inline[1]),competenceAt:brDate(inline[1]),paidAt:brDate(inline[1]),description:desc,amount,direction:amount>=0?'ENTRADA':'SAIDA',paymentMethod:paymentMethod(desc),financialStatus:'PAID',raw:{source:'pagbank_statement'}});continue
    }
    const m=lines[i].match(/^(\d{2}\/\d{2}\/\d{4})$/);if(!m)continue
    const desc=lines[i+1]||''
    const valLine=[lines[i+2],lines[i+3],lines[i+4]].find(x=>/^-?R\$\s?[\d.]+,\d{2}$/.test(x))
    if(!valLine||/saldo do dia/i.test(desc))continue
    const amount=money(valLine);out.push({occurredAt:brDate(m[1]),competenceAt:brDate(m[1]),paidAt:brDate(m[1]),description:desc,amount,direction:amount>=0?'ENTRADA':'SAIDA',paymentMethod:paymentMethod(desc),financialStatus:'PAID',raw:{source:'pagbank_statement'}})
  }
  return dedupe(out)
}

function parsePagBankSales(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[]
  for(let i=0;i<lines.length;i++){
    const d=lines[i].match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})$/);if(!d)continue
    const window=lines.slice(Math.max(0,i-10),i+12)
    const type=window.find(x=>/(Crédito|Débito|Boleto|Pix)/i.test(x))||'Venda PagBank'
    const vals=window.filter(x=>/^R\$\s?[\d.]+,\d{2}$/.test(x)).map(money);if(vals.length<1)continue
    const gross=vals[0],fee=vals[1]??0,net=vals[2]??(gross-fee)
    const externalId=window.find(x=>/^[A-F0-9]{8}-[A-F0-9-]{20,}$/i.test(x))||window.find(x=>/^\d{10,14}$/.test(x))||null
    const date=new Date(`${d[1].split('/').reverse().join('-')}T${d[2]}:00-03:00`)
    out.push({occurredAt:date,competenceAt:date,description:type,amount:gross,direction:'ENTRADA',grossAmount:gross,feeAmount:fee,netAmount:net,paymentMethod:paymentMethod(type),financialStatus:'RECEIVABLE',externalId,raw:{source:'pagbank_sales'}})
  }
  return dedupe(out)
}

function cardDueDate(text){
  const m=text.match(/Data de vencimento:\s*(\d{2})\s*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s*(\d{4})/i)||text.match(/FATURA\s+(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i)
  if(!m)return null;const mo=MONTHS[m[2].toUpperCase()];return isoDate(`${m[3]}-${String(mo).padStart(2,'0')}-${m[1]}`)
}
function parseNubankCard(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[]
  const due=cardDueDate(text);const defaultYear=due?.getFullYear()||new Date().getFullYear()
  for(const line of lines){
    const m=line.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ).*?(.+?)\s+R\$\s?([\d.]+,\d{2})$/i);if(!m)continue
    const month=MONTHS[m[2].toUpperCase()];let year=defaultYear;if(due&&month>due.getMonth()+2)year--
    const date=new Date(`${year}-${String(month).padStart(2,'0')}-${m[1]}T12:00:00-03:00`)
    out.push({occurredAt:date,competenceAt:date,dueAt:due,description:m[3],amount:-Math.abs(money(m[4])),direction:'SAIDA',paymentMethod:'Cartão de crédito',financialStatus:'OPEN',raw:{source:'nubank_card'}})
  }
  return dedupe(out)
}

function parseNubankStatement(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[];let currentDate=null
  for(let i=0;i<lines.length;i++){
    const dm=lines[i].match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})$/i)
    if(dm){const mo=MONTHS[dm[2].toUpperCase()];currentDate=new Date(`${dm[3]}-${String(mo).padStart(2,'0')}-${dm[1]}T12:00:00-03:00`);continue}
    if(!currentDate)continue
    if(/^(Transferência|Pagamento de boleto|Pagamento de fatura|Pix)/i.test(lines[i])&&!/^Total/i.test(lines[i])){
      let desc=lines[i],amount=null
      for(let j=i+1;j<Math.min(i+10,lines.length);j++){
        if(/^[-+]?\s?[\d.]+,\d{2}$/.test(lines[j])){amount=money(lines[j]);break}
        if(/Saldo do dia|Total de entradas|Total de saídas|^\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)/i.test(lines[j]))break
        desc+=' '+lines[j]
      }
      if(amount!==null){
        const received=/^Transferência\s+recebida|^Pix\s+recebido/i.test(desc),sent=/^Transferência\s+enviada|^Pix\s+enviado|^Pagamento\s+de\s+boleto|^Pagamento\s+de\s+fatura/i.test(desc)
        if(received)amount=Math.abs(amount);else if(sent)amount=-Math.abs(amount)
        out.push({occurredAt:currentDate,competenceAt:currentDate,paidAt:currentDate,description:desc.slice(0,420),amount,direction:amount>=0?'ENTRADA':'SAIDA',paymentMethod:paymentMethod(desc),financialStatus:'PAID',raw:{source:'nubank_statement'}})
      }
    }
  }
  return dedupe(out)
}

function nubankControlTotals(text,transactions){
  const compact=text.replace(/\s+/g,' ')
  const block=compact.match(/Saldo inicial\s+Rendimento líquido\s+Total de entradas\s+Total de saídas\s+Saldo final do período\s+([\d.]+,\d{2})\s+\+?([\d.]+,\d{2})\s+\+?([\d.]+,\d{2})\s+-?([\d.]+,\d{2})\s+([\d.]+,\d{2})/i)
  if(!block)return {status:'NOT_AVAILABLE'}
  const expected={opening:money(block[1]),yield:money(block[2]),inflow:Math.abs(money(block[3])),outflow:Math.abs(money(block[4])),closing:money(block[5])}
  const computed={inflow:transactions.filter(t=>t.amount>0).reduce((a,t)=>a+t.amount,0),outflow:Math.abs(transactions.filter(t=>t.amount<0).reduce((a,t)=>a+t.amount,0))}
  const expectedClosing=expected.opening+expected.yield+expected.inflow-expected.outflow
  const balanceDifference=Math.round((expectedClosing-expected.closing)*100)/100
  const inflowDifference=Math.round((expected.inflow-computed.inflow)*100)/100
  const outflowDifference=Math.round((expected.outflow-computed.outflow)*100)/100
  const ok=Math.abs(balanceDifference)<0.02&&Math.abs(inflowDifference)<0.02&&Math.abs(outflowDifference)<0.02
  return {status:ok?'OK':'MISMATCH',expected,computed,differences:{balance:balanceDifference,inflow:inflowDifference,outflow:outflowDifference}}
}

export async function parsePdf(buffer){
  const {text}=await pdf(buffer);const kind=detectPdf(text);let transactions=[]
  if(kind==='PAGBANK_STATEMENT')transactions=parsePagBankStatement(text)
  else if(kind==='PAGBANK_SALES')transactions=parsePagBankSales(text)
  else if(kind==='NUBANK_CARD')transactions=parseNubankCard(text)
  else if(kind==='NUBANK_STATEMENT')transactions=parseNubankStatement(text)
  const cnpj=(text.match(/CNPJ[:\s]*([0-9.\/-]{14,18})/i)||[])[1]||null
  const nameMatch=text.match(/(?:^|\n)(?:\d{2}\.)?\d{3}\.\d{3}\s+([^\n]{5,90})(?:\n|\s+CNPJ)/i)
  const period=parsePeriod(text)
  let validation={status:'NOT_AVAILABLE'}
  if(kind==='NUBANK_STATEMENT')validation=nubankControlTotals(text,transactions)
  const confidence=transactions.length?(validation.status==='MISMATCH'?72:90):35
  return {kind,transactions,textPreview:text.slice(0,500),textForAi:text,metadata:{document:cnpj,name:nameMatch?.[1]?.trim()||null,periodStart:period.start,periodEnd:period.end},validation,confidence}
}
