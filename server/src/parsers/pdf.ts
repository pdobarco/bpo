const MONTHS={JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12} as Record<string,number>
const money=(s:any)=>{if(s===null||s===undefined||s==='')return null;let n=String(s).replace(/R\$/gi,'').replace(/[−–—]/g,'-').replace(/\s/g,'').replace(/\./g,'').replace(',','.');const neg=n.includes('-');n=n.replace(/[^0-9.]/g,'');const v=Number(n||0);return neg?-v:v}
const brDate=(d:string)=>{const[a,b,c]=d.split('/');return new Date(`${c}-${b}-${a}T12:00:00-03:00`)}
const isoDate=(d:string|null)=>d?new Date(`${d}T12:00:00-03:00`):null
const dedupe=(arr:any[])=>{
  // Never collapse financial rows only because date/description/value are equal.
  // Real statements and card invoices can legitimately contain repeated purchases
  // with the same merchant and amount on the same day. Only a stable external ID
  // is safe enough for parser-level deduplication. File-level hash protection still
  // prevents importing the exact same document twice.
  const seenExternal=new Set<string>()
  return arr.filter(x=>{
    const id=String(x.externalId||'').trim()
    if(!id)return true
    if(seenExternal.has(id))return false
    seenExternal.add(id)
    return true
  })
}
const normalizeText=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()

function paymentMethod(desc=''){
  const t=normalizeText(desc)
  if(t.includes('PIX'))return'PIX'
  if(t.includes('CREDITO'))return'Cartão de crédito'
  if(t.includes('DEBITO'))return'Cartão de débito'
  if(t.includes('BOLETO'))return'Boleto'
  if(t.includes('TRANSFER'))return'Transferência'
  if(t.includes('FATURA'))return'Fatura de cartão'
  if(t.includes('CDB')||t.includes('RENDA FIXA'))return'Investimento'
  return null
}

/**
 * Coordinate-preserving PDF extraction based directly on Mozilla PDF.js.
 * This avoids paragraph-oriented extraction that breaks financial table rows.
 */
async function extractPdfLayoutText(buffer:Buffer){
  const pdfjs:any=await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask=pdfjs.getDocument({data:new Uint8Array(buffer),useSystemFonts:true})
  const doc=await loadingTask.promise,pages:string[]=[]
  try{
    for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
      const page=await doc.getPage(pageNo)
      const content=await page.getTextContent()
      const viewport=page.getViewport({scale:1})
      const rows=new Map<number,Array<{x:number;text:string}>>()
      for(const item of content.items||[]){
        const text=String(item?.str||'').trim();if(!text)continue
        // item.transform is expressed in the PDF page coordinate system. Using it
        // directly works for normal portrait PDFs, but fails for PDFs whose pages
        // carry /Rotate 90 or 270 (PagBank sales reports are a real example).
        // Applying the viewport transform converts every text item to displayed
        // screen coordinates before rows are reconstructed.
        const tx=pdfjs.Util.transform(viewport.transform,item.transform)
        const x=Number(tx?.[4]||0),rawY=Number(tx?.[5]||0),y=Math.round(rawY/2.2)*2.2
        const row=rows.get(y)||[];row.push({x,text});rows.set(y,row)
      }
      // Viewport coordinates grow from top to bottom, so ascending Y reproduces
      // the visual reading order regardless of the PDF page rotation.
      const lines=[...rows.entries()].sort((a,b)=>a[0]-b[0]).map(([,cells])=>cells.sort((a,b)=>a.x-b.x).map(c=>c.text).join('    ').replace(/\s+/g,' ').trim()).filter(Boolean)
      pages.push(lines.join('\n'))
      try{page.cleanup?.()}catch{}
    }
  }finally{
    try{await doc.destroy?.()}catch{}
  }
  return pages.join('\n\f\n')
}

function parsePeriod(text:string){
  const a=text.match(/(?:PER[IÍ]ODO[:\s]*|)(\d{2}\/\d{2}\/\d{4})\s+(?:A|a|-|AT[EÉ])\s+(\d{2}\/\d{2}\/\d{4})/i)
  if(a)return{start:a[1].split('/').reverse().join('-'),end:a[2].split('/').reverse().join('-')}
  const b=text.match(/(\d{2})\s+DE\s+(JANEIRO|FEVEREIRO|MARÇO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(\d{4})\s+a\s+(\d{2})\s+DE\s+\2\s+DE\s+\3/i)
  if(b){const map:any={JANEIRO:1,FEVEREIRO:2,'MARÇO':3,MARCO:3,ABRIL:4,MAIO:5,JUNHO:6,JULHO:7,AGOSTO:8,SETEMBRO:9,OUTUBRO:10,NOVEMBRO:11,DEZEMBRO:12};const m=map[b[2].toUpperCase()];return{start:`${b[3]}-${String(m).padStart(2,'0')}-${b[1]}`,end:`${b[3]}-${String(m).padStart(2,'0')}-${b[4]}`}}
  return{start:null,end:null}
}

export function detectPdf(text:string){
  const t=normalizeText(text)
  if(t.includes('RELATORIO DE VENDAS')&&t.includes('CODIGO NSU')&&t.includes('PAGBANK'))return'PAGBANK_SALES'
  if(t.includes('EXTRATO DA CONTA')&&(t.includes('PAGSEGURO')||t.includes('PAGBANK')))return'PAGBANK_STATEMENT'
  if(t.includes('SALDO FINAL DO PERIODO')&&t.includes('MOVIMENTACOES')&&t.includes('TOTAL DE ENTRADAS')&&t.includes('TOTAL DE SAIDAS'))return'NUBANK_STATEMENT'
  if(t.includes('FATURA')&&t.includes('TRANSACOES')&&(t.includes('NU PAGAMENTOS')||t.includes('NUBANK')||t.includes('NU FINANCEIRA')))return'NUBANK_CARD'
  return'GENERIC_PDF'
}

function parsePagBankStatement(text:string){
  const out:any[]=[]
  // Coordinate-preserving extraction keeps these statements as one visual row.
  const rowRe=/^\s*(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([−–—-]?\s*R\$\s*[\d.]+,\d{2})\s*$/gim
  for(const m of text.matchAll(rowRe)){
    const desc=String(m[2]||'').trim();if(/saldo do dia/i.test(desc))continue
    const amount=money(m[3]);if(amount===null)continue
    const occurredAt=brDate(m[1])
    out.push({occurredAt,competenceAt:occurredAt,paidAt:occurredAt,description:desc,amount,direction:amount>=0?'ENTRADA':'SAIDA',paymentMethod:paymentMethod(desc),financialStatus:'PAID',raw:{source:'pagbank_statement'}})
  }
  return dedupe(out)
}

function parsePagBankSales(text:string){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out:any[]=[]
  const uuidRe=/([A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12})/i
  const rowRe=/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s+Pagbank\s+-\s+(\d{12}|-)\s+(.+?)\s+Aprovada\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})$/i
  let pendingExternalId:string|null=null
  for(const line of lines){
    const uuid=line.match(uuidRe)
    if(uuid&&!/^\d{2}\/\d{2}\/\d{4}/.test(line)){pendingExternalId=uuid[1];continue}
    const m=line.match(rowRe);if(!m)continue
    const gross=Math.abs(Number(money(m[8])||0)),fee=Math.abs(Number(money(m[9])||0)),net=Math.abs(Number(money(m[10])||0)),type=m[7].trim()
    const date=new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`)
    out.push({occurredAt:date,competenceAt:date,description:type,amount:gross,direction:'ENTRADA',grossAmount:gross,feeAmount:fee,netAmount:net,paymentMethod:paymentMethod(type),financialStatus:'RECEIVABLE',externalId:pendingExternalId||null,raw:{source:'pagbank_sales',nsu:m[6],transactionType:type}})
    pendingExternalId=null
  }
  return dedupe(out)
}

function cardDueDate(text:string){
  const m=text.match(/Data de vencimento:\s*(\d{2})\s*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s*(\d{4})/i)||text.match(/FATURA\s+(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i)
  if(!m)return null;const mo=MONTHS[m[2].toUpperCase()];return isoDate(`${m[3]}-${String(mo).padStart(2,'0')}-${m[1]}`)
}
function parseNubankCard(text:string){
  const out:any[]=[]
  const due=cardDueDate(text),defaultYear=due?.getFullYear()||new Date().getFullYear()
  const rowRe=/^\s*(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+•{2,}\s*\d+\s+(.+?)\s+R\$\s*([\d.]+,\d{2})\s*$/gim
  for(const m of text.matchAll(rowRe)){
    const month=MONTHS[m[2].toUpperCase()];let year=defaultYear;if(due&&month>due.getMonth()+2)year--
    const date=new Date(`${year}-${String(month).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}T12:00:00-03:00`)
    out.push({occurredAt:date,competenceAt:date,dueAt:due,description:m[3].trim(),amount:-Math.abs(Number(money(m[4])||0)),direction:'SAIDA',paymentMethod:'Cartão de crédito',financialStatus:'OPEN',raw:{source:'nubank_card'}})
  }
  return dedupe(out)
}

function parseNubankStatement(text:string){
  const lines=text.split(/\r?\n/),out:any[]=[];let currentDate:Date|null=null
  const dateRe=/^\s*(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})\b/i
  const actionRe=/^\s*(?:\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+\d{4}\s+)?(Transferência recebida pelo Pix|Transferência Recebida|Transferência enviada pelo Pix|Pagamento de boleto efetuado|Pagamento de fatura)\s*(.*?)\s+([+\-−–—]?\s*[\d.]+,\d{2})\s*$/i
  for(const rawLine of lines){
    const line=rawLine.trimEnd(),dm=line.match(dateRe)
    if(dm){const mo=MONTHS[dm[2].toUpperCase()];currentDate=new Date(`${dm[3]}-${String(mo).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}T12:00:00-03:00`)}
    const m=line.match(actionRe);if(!m||!currentDate)continue
    const action=m[1].trim(),details=m[2].replace(/\s+-\s*$/,'').trim();let amount=Math.abs(Number(money(m[3])||0))
    const received=/^Transferência\s+(recebida pelo Pix|Recebida)$/i.test(action)
    if(!received)amount=-amount
    const desc=`${action}${details?' '+details:''}`.slice(0,420)
    out.push({occurredAt:currentDate,competenceAt:currentDate,paidAt:currentDate,description:desc,amount,direction:amount>=0?'ENTRADA':'SAIDA',paymentMethod:paymentMethod(action),financialStatus:'PAID',raw:{source:'nubank_statement'}})
  }
  return dedupe(out)
}

function nubankControlTotals(text:string,transactions:any[]){
  const compact=text.replace(/\s+/g,' ')
  const opening=(compact.match(/Saldo inicial\s+([\d.]+,\d{2})/i)||[])[1]
  const yieldValue=(compact.match(/Rendimento líquido\s+\+?([\d.]+,\d{2})/i)||[])[1]
  const inflow=(compact.match(/Total de entradas\s+\+?\s*([\d.]+,\d{2})/i)||[])[1]
  const outflow=(compact.match(/Total de saídas\s+-?\s*([\d.]+,\d{2})/i)||[])[1]
  const closingMatches=[...compact.matchAll(/Saldo final do período\s+(?:R\$\s*)?([\d.]+,\d{2})/gi)]
  const closing=closingMatches.at(-1)?.[1]
  if(!opening||!inflow||!outflow||!closing)return{status:'NOT_AVAILABLE'}
  const expected={opening:Number(money(opening)||0),yield:Number(money(yieldValue||'0,00')||0),inflow:Math.abs(Number(money(inflow)||0)),outflow:Math.abs(Number(money(outflow)||0)),closing:Number(money(closing)||0)}
  const computed={inflow:transactions.filter(t=>t.amount>0).reduce((a,t)=>a+t.amount,0),outflow:Math.abs(transactions.filter(t=>t.amount<0).reduce((a,t)=>a+t.amount,0))}
  const expectedClosing=expected.opening+expected.yield+expected.inflow-expected.outflow
  const balanceDifference=Math.round((expectedClosing-expected.closing)*100)/100,inflowDifference=Math.round((expected.inflow-computed.inflow)*100)/100,outflowDifference=Math.round((expected.outflow-computed.outflow)*100)/100
  const ok=Math.abs(balanceDifference)<0.02&&Math.abs(inflowDifference)<0.02&&Math.abs(outflowDifference)<0.02
  return{status:ok?'OK':'MISMATCH',expected,computed,differences:{balance:balanceDifference,inflow:inflowDifference,outflow:outflowDifference}}
}

export async function parsePdf(buffer:Buffer){
  const text=await extractPdfLayoutText(buffer),kind=detectPdf(text);let transactions:any[]=[]
  if(kind==='PAGBANK_STATEMENT')transactions=parsePagBankStatement(text)
  else if(kind==='PAGBANK_SALES')transactions=parsePagBankSales(text)
  else if(kind==='NUBANK_CARD')transactions=parseNubankCard(text)
  else if(kind==='NUBANK_STATEMENT')transactions=parseNubankStatement(text)
  const cnpj=(text.match(/CNPJ[:\s]*([0-9.\/-]{14,18})/i)||[])[1]||null
  const nameMatch=text.match(/(?:^|\n)(?:\d{2}\.)?\d{3}\.\d{3}\s+([^\n]{5,90})(?:\n|\s+CNPJ)/i)
  const period=parsePeriod(text)
  let validation:any={status:'NOT_AVAILABLE'}
  if(kind==='NUBANK_STATEMENT')validation=nubankControlTotals(text,transactions)
  if(kind==='NUBANK_CARD'&&transactions.length){
    const totalMatch=text.match(/Total de compras de todos os cartões[^\n]*R\$\s*([\d.]+,\d{2})/i),expected=totalMatch?Math.abs(Number(money(totalMatch[1])||0)):null,computed=Math.abs(transactions.reduce((a,t)=>a+t.amount,0))
    if(expected!==null)validation={status:Math.abs(expected-computed)<0.02?'OK':'MISMATCH',expected:{purchases:expected},computed:{purchases:computed},differences:{purchases:Math.round((expected-computed)*100)/100}}
  }
  const confidence=transactions.length?(validation.status==='MISMATCH'?78:96):35
  return{kind,transactions,textPreview:text.slice(0,500),textForAi:text,metadata:{document:cnpj,name:nameMatch?.[1]?.trim()||null,periodStart:period.start,periodEnd:period.end},validation,confidence}
}
