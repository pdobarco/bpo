import XLSX from 'xlsx'
import { digits, normalize } from '../services/entity.js'

const headerKey = s => normalize(s).replace(/[^A-Z0-9]/g,'')
const aliases = {
  supplier: ['FORNECEDOR','RAZAOSOCIAL','NOMEFORNECEDOR','NOME','FAVORECIDO','BENEFICIARIO'],
  document: ['CNPJ','CPFCNPJ','DOCUMENTO','CNPJCPF','CPF'],
  category: ['CLASSIFICACAO','PLANO DE CONTAS','PLANODECONTAS','CONTA','CATEGORIA','CATEGORIACONTABIL','DESPESA','TIPODEDESPESA'],
  direction: ['DIRECAO','TIPOMOVIMENTO','ENTRADASAIDA']
}

function pick(headers, key) {
  const accepted = aliases[key].map(headerKey)
  return headers.find(h => accepted.includes(headerKey(h)))
}

export function parseSupplierBase(buffer) {
  const wb = XLSX.read(buffer,{type:'buffer',cellDates:true})
  const records = []
  let detected = false
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet],{defval:''})
    if (!rows.length) continue
    const headers = Object.keys(rows[0])
    const supplierCol = pick(headers,'supplier')
    const categoryCol = pick(headers,'category')
    const documentCol = pick(headers,'document')
    const directionCol = pick(headers,'direction')
    if (!supplierCol || !categoryCol) continue
    detected = true
    for (const row of rows) {
      const supplier = String(row[supplierCol] || '').trim()
      const category = String(row[categoryCol] || '').trim()
      if (!supplier || !category) continue
      const d = digits(row[documentCol] || '')
      const directionRaw = normalize(row[directionCol] || '')
      const direction = directionRaw.includes('ENTR') || directionRaw.includes('RECEB') ? 'ENTRADA' : 'SAIDA'
      records.push({supplier, normalizedParty:normalize(supplier), document:(d.length===11||d.length===14)?d:null, category, direction, raw:{sheet,row}})
    }
  }
  return { matched:detected, kind:'SUPPLIER_BASE', records, confidence:detected ? (records.length?98:70) : 0 }
}
