import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-'))
process.env.DB_PATH = path.join(dir, 't.db')
const db = await import('./db.js')
const { exportHeaders, inboundHeaders, inboundsWorkbook, outboundsWorkbook } = await import('./export.js')

function assert(condition, message) {
  if (!condition) {
    console.error('失败：', message)
    process.exit(1)
  }
}

const baotou = db.meta().platforms.find((item) => item.name === '包头平台')
db.createInbound({ bizDate: '2026-11-09', platformId: baotou.id, variety: 'DY001', spec: '8000粒', quantity: 100 })

let row = db.inventory('DY001').rows[0]
assert(row.platformQty[baotou.id] === 100 && row.total === 100, '入库后包头和总库存都是 100')

const first = db.createOutbound({
  bizDate: '2026-11-09',
  platformId: baotou.id,
  variety: 'DY001',
  spec: '8000粒',
  orderBags: 30,
  customerName: '王龙',
  phone: '19900000001',
  receivedAmount: 500,
  paymentMethodName: '个人微信',
  province: '甘肃省',
  city: '天水市',
  district: '张家川县',
  salespersonName: '张伟',
})
row = db.inventory('DY001').rows[0]
assert(row.platformQty[baotou.id] === 70 && row.total === 70 && row.retailOut === 0, '平台出库扣对应平台')

let missingHouse = false
try {
  db.createOutbound({ bizDate: '2026-11-10', platformId: null, variety: 'DY001', spec: '8000粒', orderBags: 10, customerName: '零售客户' })
} catch { missingHouse = true }
assert(missingHouse, '出库必须选库房')
assert(db.outboundStats({ variety: 'DY001' }).totalBags === 30, '品种出库')
assert(db.outboundStats({ variety: 'DY001', dateFrom: '2026-11-09', dateTo: '2026-11-09' }).totalBags === 30, '日期筛选')

assert(db.paymentStats({ customer: '王龙' }).totalAmount === 500, '按客户查回款')
assert(db.paymentStats({ dateFrom: '2026-11-09', dateTo: '2026-11-09' }).totalAmount === 500, '按日期查回款')
assert(db.paymentStats({ customer: '没有这个人' }).totalAmount === 0, '其他客户查不到')

const looked = db.lookupCustomer('19900000001')
assert(looked.customerName === '王龙' && looked.city === '天水市' && looked.salespersonName === '张伟', '电话带出客户')
assert(String(looked.id) === looked.customerCode, '新客户编号就是自己的编号')

db.setOutboundVoid(first.id, true)
row = db.inventory('DY001').rows[0]
assert(row.platformQty[baotou.id] === 100 && row.total === 100, '作废后库存回去')
db.setOutboundVoid(first.id, false)
row = db.inventory('DY001').rows[0]
assert(row.total === 70, '恢复后回到作废前')

let shortStock = false
try {
  db.createOutbound({ bizDate: '2026-11-11', platformId: baotou.id, variety: 'DY003', spec: '8000粒', orderBags: 5 })
} catch { shortStock = true }
assert(shortStock, '库存不足不能出库')

db.createOutbound({ bizDate: '2026-11-11', platformId: baotou.id, customerName: '只回款', receivedAmount: 80 })
assert(db.paymentStats({ customer: '只回款' }).totalAmount === 80, '只记回款')
assert(db.inventory('').rows.every((item) => item.variety), '只记回款不产生库存行')

const buffer = await outboundsWorkbook(db.listOutbounds({}))
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(buffer)
const headers = workbook.getWorksheet('出库明细').getRow(1).values.slice(1)
assert(JSON.stringify(headers) === JSON.stringify(exportHeaders), '导出列顺序')
assert(!headers.includes('销售') && !headers.includes('单价/元') && !headers.includes('返利'), '不导出销售及后面的旧列')
const inboundBook = new ExcelJS.Workbook()
await inboundBook.xlsx.load(await inboundsWorkbook(db.listInbounds({})))
const inboundHead = inboundBook.getWorksheet('入库明细').getRow(1).values.slice(1)
assert(JSON.stringify(inboundHead) === JSON.stringify(inboundHeaders), '入库导出列')

const created = db.createPlatform('赤峰库')
assert(created.name === '赤峰库', '可以新增库房')
let blocked = false
try { db.deletePlatform(baotou.id) } catch { blocked = true }
assert(blocked, '有账的库不能删')
assert(db.deletePlatform(created.id).ok, '没账的库可以删')
let duplicated = false
try { db.createPlatform('包头') } catch { duplicated = true }
assert(duplicated, '同名库房不能重复加')

const admin = db.login('admin', '123456')
assert(db.changePassword(admin.user.id, 'wrong', '654321').ok === false, '原密码不对不能改')
assert(db.changePassword(admin.user.id, '123456', '12345').ok === false, '新密码至少 6 位')
assert(db.changePassword(admin.user.id, '123456', '654321').ok, '可以改密码')
assert(db.login('admin', '123456') === null && db.login('admin', '654321'), '改完只用新密码能登录')
let refused = false
try { db.clearBusinessData(admin.user.id, 'wrong') } catch { refused = true }
assert(refused && db.listInbounds({}).length > 0, '密码不对不能清空')
db.clearBusinessData(admin.user.id, '654321')
assert(db.listInbounds({}).length === 0 && db.paymentStats({}).totalAmount === 0, '密码正确后账被清空')
assert(db.meta().platforms.length === 4, '清空后仓库还在')

console.log('selfcheck ok')
db.close()
fs.rmSync(dir, { recursive: true, force: true })
