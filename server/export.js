import ExcelJS from 'exceljs'

const columns = [
  ['日期', 'bizDate'],
  ['客户编号', 'customerCode'],
  ['省份', 'province'],
  ['市级', 'city'],
  ['区域', 'district'],
  ['乡镇', 'town'],
  ['业务员', 'salespersonName'],
  ['客户', 'customerName'],
  ['电话', 'phone'],
  ['订货/袋', 'orderBags'],
  ['回款', 'receivedAmount'],
  ['付款方式', 'paymentMethodName'],
  ['品种', 'variety'],
  ['规格/粒', 'spec'],
  ['发货平台', 'platformName'],
]

export const exportHeaders = columns.map(([header]) => header)

const inboundColumns = [
  ['日期', 'bizDate'],
  ['品种', 'variety'],
  ['规格/粒', 'spec'],
  ['库房', 'platformName'],
  ['袋数', 'quantity'],
]

export const inboundHeaders = inboundColumns.map(([header]) => header)

export async function inboundsWorkbook(rows) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('入库明细')
  sheet.columns = inboundColumns.map(([header, key]) => ({ header, key, width: 16 }))
  for (const row of rows) {
    sheet.addRow({
      bizDate: row.bizDate || '',
      variety: row.variety || '',
      spec: row.spec || '',
      platformName: String(row.platformName || '').replace(/平台$/, ''),
      quantity: row.quantity || null,
    })
  }
  sheet.getRow(1).font = { bold: true }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function outboundsWorkbook(rows) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('出库明细')
  sheet.columns = columns.map(([header, key]) => ({ header, key, width: key === 'phone' ? 16 : 14 }))
  for (const row of rows) {
    const line = {}
    for (const [, key] of columns) {
      if (key === 'orderBags' || key === 'receivedAmount') line[key] = row[key] || null
      else line[key] = row[key] || ''
    }
    sheet.addRow(line)
  }
  sheet.getRow(1).font = { bold: true }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
