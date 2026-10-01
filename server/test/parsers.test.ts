import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseTabular } from '../src/parsers/tabular.js'
import { parseSupplierBase } from '../src/parsers/suppliers.js'

function workbook(rows: any[][]) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Plan1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('parseTabular lê valores em formato brasileiro e define a direção', () => {
  const parsed = parseTabular(workbook([
    ['Data', 'Descrição', 'Valor'],
    ['05/09/2026', 'Venda balcão', '1.234,56'],
    ['06/09/2026', 'Pagamento fornecedor', '-99,90'],
    ['07/09/2026', 'Linha zerada', '0']
  ]))
  assert.equal(parsed.transactions.length, 2)
  assert.equal(parsed.transactions[0].amount, 1234.56)
  assert.equal(parsed.transactions[0].direction, 'ENTRADA')
  assert.equal(parsed.transactions[1].amount, -99.9)
  assert.equal(parsed.transactions[1].direction, 'SAIDA')
})

test('parseTabular usa colunas de crédito/débito quando não há valor único', () => {
  const parsed = parseTabular(workbook([
    ['Data', 'Histórico', 'Débito'],
    ['05/09/2026', 'Tarifa', '15,00']
  ]))
  assert.equal(parsed.transactions[0].amount, -15)
})

test('parseSupplierBase reconhece base de fornecedores e valida documento', () => {
  const out = parseSupplierBase(workbook([
    ['Fornecedor', 'CNPJ', 'Categoria'],
    ['Gráfica Beta', '12.345.678/0001-90', 'Material de escritório / gráfica'],
    ['Sem categoria', '', '']
  ]))
  assert.equal(out.matched, true)
  assert.equal(out.records.length, 1)
  assert.equal(out.records[0].document, '12345678000190')
  assert.equal(out.records[0].normalizedParty, 'GRAFICA BETA')
  assert.equal(out.records[0].direction, 'SAIDA')
})

test('parseSupplierBase ignora planilhas que não são base de fornecedores', () => {
  assert.equal(parseSupplierBase(workbook([['Data', 'Valor'], ['01/01/2026', 10]])).matched, false)
})
