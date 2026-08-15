import XLSX from 'xlsx'
const norm=s=>(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'')
const aliases={
  date:['DATA','DATAMOVIMENTO','DTMOV','DATATRANSACAO','DATAPAGAMENTO'], competence:['DATACOMPETENCIA','COMPETENCIA','DTCOMPETENCIA'],
  due:['DATAVENCIMENTO','VENCIMENTO','DTVENCIMENTO'], paid:['DATAPAGAMENTO','PAGAMENTO','DTPAGAMENTO','DATARECEBIMENTO'],
  description:['DESCRICAO','HISTORICO','HIST','DESCRICAOMOVIMENTO'], value:['VALOR','VLR','VALORMOVIMENTO'],credit:['CREDITO','ENTRADA','VALORCREDITO'],debit:['DEBITO','SAIDA','VALORDEBITO'],
  gross:['VALORBRUTO','BRUTO'],fee:['TAXA','TARIFA'],net:['VALORLIQUIDO','LIQUIDO'],status:['STATUS'],type:['TIPOTRANSACAO','TIPO'],
  payment:['FORMADEPAGAMENTO','MEIODEPAGAMENTO','FORMAPAGAMENTO'], party:['FORNECEDOR','CLIENTE','FAVORECIDO','BENEFICIARIO','RAZAOSOCIAL'], document:['CNPJ','CPF','CPFCNPJ','DOCUMENTO']
}
function pick(headers,key){const a=aliases[key]||[];return headers.find(h=>a.includes(norm(h)))}
function n(v){if(typeof v==='number')return v;return Number(String(v||'0').replace(/R\$/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0}
function dt(v){if(!v)return null;if(v instanceof Date)return v;const s=String(v).trim();const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);if(br)return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00-03:00`);const d=new Date(v);return Number.isNaN(d.getTime())?null:d}
export function parseTabular(buffer){
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:true});let transactions=[]
  for(const s of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[s],{defval:''});if(!rows.length)continue
    const hs=Object.keys(rows[0]);const cols=Object.fromEntries(Object.keys(aliases).map(k=>[k,pick(hs,k)]))
    for(const r of rows){
      const desc=r[cols.description]||r[cols.type]||r[cols.party]||'Lançamento importado'
      let amount=cols.value?n(r[cols.value]):(cols.credit?n(r[cols.credit]):-n(r[cols.debit]))
      const gross=cols.gross?n(r[cols.gross]):null,fee=cols.fee?n(r[cols.fee]):null,net=cols.net?n(r[cols.net]):null
      if(gross!==null&&amount===0)amount=gross;if(!amount&&!gross&&!net)continue
      const occurredAt=dt(r[cols.date])||dt(r[cols.paid])||new Date(), competenceAt=dt(r[cols.competence])||occurredAt, dueAt=dt(r[cols.due]), paidAt=dt(r[cols.paid])||(String(r[cols.status]||'').toUpperCase().includes('PAGO')?occurredAt:null)
      const paymentMethod=String(r[cols.payment]||r[cols.type]||'').trim()||null
      const financialStatus=String(r[cols.status]||'').toUpperCase().includes('PAG')||paidAt?'PAID':(dueAt?'OPEN':'PAID')
      transactions.push({occurredAt,competenceAt,dueAt,paidAt,description:String(desc),amount,direction:amount>=0?'ENTRADA':'SAIDA',grossAmount:gross,feeAmount:fee,netAmount:net,paymentMethod,financialStatus,raw:{sheet:s,row:r,source:'tabular'}})
    }
  }
  return {kind:'TABULAR',transactions,confidence:transactions.length?85:25,metadata:{periodStart:null,periodEnd:null},validation:{status:'NOT_AVAILABLE'}}
}
