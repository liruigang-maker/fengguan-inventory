<template>
  <main class="phone">
    <header class="top">
      <div class="page-head">
        <img src="/icon-out.jpg" alt="" />
        <div>
          <p class="eyebrow">丰冠农业</p>
          <h1>出库</h1>
        </div>
      </div>
      <router-link class="back" to="/">返回</router-link>
    </header>

    <section class="block">
      <h2>从哪个库出</h2>
      <Warehouses v-model="platformId" :platforms="platforms" />
    </section>

    <section class="block">
      <h2>什么货</h2>
      <label class="line">日期<input v-model="form.bizDate" type="date" /></label>
      <p class="field-label">品种</p>
      <div class="chips">
        <button v-for="name in varieties" :key="name" type="button" :class="{ on: form.variety === name && !custom }" @click="pickVariety(name)">{{ name }}</button>
        <button type="button" :class="{ on: custom }" @click="startCustom">新品种</button>
      </div>
      <div v-if="custom" class="fields">
        <label class="line">品种<input v-model="form.variety" placeholder="例如 DY001" /></label>
        <label class="line">规格<input v-model="form.spec" placeholder="例如 8000粒" /></label>
      </div>
      <template v-else-if="form.variety">
        <p class="field-label">规格</p>
        <div class="chips">
          <button v-for="name in specs" :key="name" type="button" :class="{ on: form.spec === name }" @click="form.spec = name">{{ specLabel(name) }}</button>
        </div>
      </template>
      <p v-if="stockText" class="remain" :class="{ bad: notEnough }">{{ stockText }}</p>
      <label class="line bag-line">出库袋数<input :value="form.orderBags" inputmode="numeric" placeholder="0" @input="setBags($event.target.value)" /></label>
    </section>

    <section class="block">
      <h2>客户</h2>
      <label class="line">电话<input v-model="form.phone" inputmode="tel" placeholder="填写后带出这个客户" @blur="lookup" /></label>
      <label class="line">客户<input v-model="form.customerName" placeholder="客户名称" @blur="lookup" /></label>
      <p class="field-label">业务员</p>
      <div v-if="salespersons.length" class="chips">
        <button v-for="item in salespersons" :key="item.id" type="button" :class="{ on: form.salespersonName === item.name }" @click="form.salespersonName = item.name">{{ item.name }}</button>
      </div>
      <label class="line">姓名<input v-model="form.salespersonName" placeholder="点上面的人，或新写一个" /></label>
    </section>

    <section class="block">
      <h2>地址</h2>
      <label class="line">省份<input v-model="form.province" list="provinces" /></label>
      <label class="line">市级<input v-model="form.city" list="cities" /></label>
      <label class="line">区域<input v-model="form.district" list="districts" /></label>
      <label class="line">乡镇<input v-model="form.town" list="towns" /></label>
    </section>

    <section class="block">
      <h2>回款</h2>
      <label class="line">回款（元）<input v-model="form.receivedAmount" inputmode="decimal" placeholder="这次收回多少，可以空着" /></label>
      <div class="chips">
        <button v-for="item in paymentMethods" :key="item.id" type="button" :class="{ on: form.paymentMethodName === item.name }" @click="form.paymentMethodName = item.name">{{ item.name }}</button>
      </div>
      <label class="line">付款方式<input v-model="form.paymentMethodName" list="payments" placeholder="没有的话直接写" /></label>
    </section>

    <p v-if="error" class="err">{{ error }}</p>
    <button class="save" type="button" :disabled="saving" @click="save">{{ saving ? '正在记' : '确认出库' }}</button>

    <datalist id="payments"><option v-for="item in paymentMethods" :key="item.id" :value="item.name" /></datalist>
    <datalist id="provinces"><option v-for="item in places.provinces" :key="item" :value="item" /></datalist>
    <datalist id="cities"><option v-for="item in places.cities" :key="item" :value="item" /></datalist>
    <datalist id="districts"><option v-for="item in places.districts" :key="item" :value="item" /></datalist>
    <datalist id="towns"><option v-for="item in places.towns" :key="item" :value="item" /></datalist>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { specLabel, today } from '../format'
import Warehouses from '../components/Warehouses.vue'

const router = useRouter()
const platforms = ref([])
const products = ref([])
const rows = ref([])
const salespersons = ref([])
const paymentMethods = ref([])
const places = reactive({ provinces: [], cities: [], districts: [], towns: [] })
const platformId = ref(undefined)
const custom = ref(false)
const error = ref('')
const saving = ref(false)
const form = reactive({
  bizDate: today(),
  variety: '',
  spec: '',
  orderBags: '',
  phone: '',
  customerName: '',
  salespersonName: '',
  province: '',
  city: '',
  district: '',
  town: '',
  receivedAmount: '',
  paymentMethodName: '',
})

const varieties = computed(() => [...new Set(products.value.map((item) => item.variety))])
const specs = computed(() => [...new Set(products.value.filter((item) => item.variety === form.variety).map((item) => item.spec))])
const current = computed(() => rows.value.find((item) => item.variety === form.variety && item.spec === form.spec))
const houseName = computed(() => String(platforms.value.find((item) => item.id === platformId.value)?.name || '').replace(/平台$/, ''))
const houseQty = computed(() => {
  if (!current.value || platformId.value == null) return null
  return Number(current.value.platformQty[platformId.value] || 0)
})
const notEnough = computed(() => houseQty.value != null && Number(form.orderBags || 0) > houseQty.value)
const stockText = computed(() => {
  if (!form.variety || !form.spec) return ''
  if (platformId.value == null) return '先选库房，再看这个库还有多少'
  if (!current.value) return `${houseName.value}还没有这个规格`
  return `${houseName.value}的${specLabel(form.spec)}现在还有 ${bags(houseQty.value)} 袋`
})

function bags(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}
function pickVariety(name) {
  custom.value = false
  form.variety = name
  const matched = products.value.filter((item) => item.variety === name)
  form.spec = matched.length === 1 ? matched[0].spec : ''
}
function startCustom() {
  custom.value = true
  form.variety = ''
  form.spec = ''
}
function setBags(raw) {
  form.orderBags = String(raw).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
}

let lastLookup = ''
function lookupKey() {
  return form.phone ? `p:${form.phone}` : `n:${form.customerName}`
}
async function lookup() {
  const key = lookupKey()
  if (key === 'p:' || key === 'n:' || key === lastLookup) return
  lastLookup = key
  const data = await api(`/api/customers/lookup?phone=${encodeURIComponent(form.phone)}&name=${encodeURIComponent(form.phone ? '' : form.customerName)}`)
  const customer = data.customer
  if (!customer) return
  form.customerName = customer.customerName
  form.province = customer.province
  form.city = customer.city
  form.district = customer.district
  form.town = customer.town
  form.salespersonName = customer.salespersonName
  if (customer.phone) form.phone = customer.phone
}

onMounted(async () => {
  const [meta, inventory] = await Promise.all([api('/api/meta'), api('/api/inventory')])
  platforms.value = meta.platforms
  products.value = meta.products
  rows.value = inventory.rows
  salespersons.value = meta.salespersons
  paymentMethods.value = meta.paymentMethods
  Object.assign(places, meta.places)
  if (meta.today) form.bizDate = meta.today
})

async function save() {
  error.value = ''
  const bagsCount = Number(form.orderBags || 0)
  const money = Number(form.receivedAmount || 0)
  if (platformId.value == null) {
    error.value = '先选库房'
    return
  }
  if (bagsCount <= 0 && money <= 0) {
    error.value = '出库袋数和回款至少填一个'
    return
  }
  if (bagsCount > 0 && (!String(form.variety).trim() || !String(form.spec).trim())) {
    error.value = '有出库数量时要选品种和规格'
    return
  }
  if (bagsCount > 0 && (houseQty.value == null || bagsCount > houseQty.value)) {
    error.value = `${houseName.value || '这个库'}不够出，现在还有 ${bags(houseQty.value || 0)} 袋`
    return
  }
  saving.value = true
  try {
    await api('/api/outbounds', { method: 'POST', body: { ...form, platformId: platformId.value } })
    router.replace('/')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>
