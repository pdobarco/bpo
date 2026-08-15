export const normalize = s => (s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim()

export const digits = s => String(s || '').replace(/\D/g, '')

const transferPrefixes = [
  /^TRANSFERENCIA RECEBIDA PELO PIX\s+/,
  /^TRANSFERENCIA RECEBIDA\s+/,
  /^TRANSFERENCIA ENVIADA PELO PIX\s+/,
  /^TRANSFERENCIA ENVIADA\s+/,
  /^PIX RECEBIDO\s+/,
  /^PIX ENVIADO\s+/,
  /^PAGAMENTO DE BOLETO EFETUADO\s+/,
  /^PAGAMENTO DE BOLETO\s+/
]

export function extractDocument(text = '') {
  const matches = String(text).match(/(?:\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g) || []
  for (const raw of matches) {
    const d = digits(raw)
    if (d.length === 14 || d.length === 11) return d
  }
  return null
}

export function extractParty(description = '') {
  const original = String(description).replace(/\s+/g, ' ').trim()
  let text = normalize(original)
  if (/^PAGAMENTO DE FATURA/.test(text)) return 'CARTAO DE CREDITO'
  for (const rx of transferPrefixes) {
    if (rx.test(text)) { text = text.replace(rx, '').trim(); break }
  }
  const firstSep = text.indexOf(' - ')
  if (firstSep > 2) text = text.slice(0, firstSep)
  text = text
    .replace(/\s+-?\s*PARCELA\s+\d+\/\d+.*$/i, '')
    .replace(/\s+AGENCIA:.*$/i, '')
    .replace(/\s+CONTA:.*$/i, '')
    .replace(/\s+\*{2,}\.?[\d.-]+.*$/i, '')
    .replace(/\s+/g, ' ').trim()
  return text.slice(0, 140) || normalize(original).slice(0, 140)
}

export function isIncomingTransfer(description = '') { return /^(TRANSFERENCIA RECEBIDA|PIX RECEBIDO)/.test(normalize(description)) }
export function isOutgoingTransfer(description = '') { return /^(TRANSFERENCIA ENVIADA|PIX ENVIADO)/.test(normalize(description)) }

export function isLikelyBusinessName(name = '') {
  const n = normalize(name)
  if (!n || n.length < 4) return false
  return /\b(LTDA|S\.?A\.?|EIRELI|COMERCIO|COMERCIAL|INDUSTRIA|SERVICOS|SERVICO|SUPERMERCADO|MERCADO|POSTO|FRETE|LOGISTICA|GRAFICA|FARMACIA|DROGARIA|TECNOLOGIA|SOFTWARE|ENERGIA|TELECOM|CONTABIL|ASSESSORIA|CONSULTORIA|EMBALAG|MATERIAIS|ARMAZEM|PAPELARIA|RESTAURANTE|HOTEL|TRANSPORTES?)\b/.test(n)
}

export function accountMatchesDescription(account, description = '') {
  const txt = normalize(description)
  const descDigits = digits(description)
  const doc = digits(account?.document)
  const acct = digits(account?.account)
  const agency = digits(account?.agency)
  const label = normalize(account?.label || '')
  const institution = normalize(account?.institution || '')
  const aliases = Array.isArray(account?.aliases) ? account.aliases.map(normalize) : []

  if (doc.length >= 11 && descDigits.includes(doc)) return true
  if (acct.length >= 4 && descDigits.includes(acct) && (!agency || descDigits.includes(agency))) return true
  if (label.length >= 5 && txt.includes(label)) return true
  if (institution.length >= 5 && txt.includes(institution) && acct.length >= 4 && descDigits.includes(acct)) return true
  return aliases.some(a => a.length >= 4 && txt.includes(a))
}
