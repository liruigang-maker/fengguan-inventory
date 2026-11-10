<template>
  <main class="phone">
    <header class="top">
      <div class="page-head">
        <img src="/icon-in.jpg" alt="" />
        <div>
          <p class="eyebrow">丰冠农业</p>
          <h1>入库</h1>
        </div>
      </div>
      <router-link class="back" to="/">返回</router-link>
    </header>

    <p class="range-note">记入今天，{{ cnDate(today()) }}</p>
    <section class="section">
      <p>进哪个库</p>
      <Warehouses v-model="platformId" :platforms="platforms" />
    </section>

    <section class="section">
      <p>品种</p>
      <div class="chips">
        <button
          v-for="name in varieties"
          :key="name"
          type="button"
          :class="{ on: variety === name && !custom }"
          @click="pickVariety(name)"
        >{{ name }}</button>
        <button type="button" :class="{ on: custom }" @click="startCustom">新品种</button>
      </div>
      <div v-if="custom" class="fields">
        <label class="line">品种<input v-model="variety" placeholder="例如 DY001" /></label>
        <label class="line">规格<input v-model="spec" placeholder="例如 8000粒" /></label>
      </div>
      <template v-else-if="variety">
        <p class="field-label">规格</p>
        <div class="chips">
          <button
            v-for="name in specs"
            :key="name"
            type="button"
            :class="{ on: spec === name }"
            @click="spec = name"
          >{{ specLabel(name) }}</button>
        </div>
      </template>
      <p v-if="current" class="remain">规格 {{ specLabel(spec) }}，现在还有 {{ bags(current.total) }} 袋</p>
      <p v-else-if="variety && spec" class="remain">这个规格还没有库存</p>
    </section>

    <section class="section">
      <p>多少袋</p>
      <div class="qty">
        <input :value="quantity" inputmode="numeric" type="text" placeholder="0" @input="setQuantity($event.target.value)" />
      </div>
      <div class="steps">
        <button type="button" @click="bump(1)">+1袋</button>
        <button type="button" @click="bump(10)">+10袋</button>
      </div>
      <div class="chips" style="margin-top: 8px">
        <button type="button" @click="quantity = 50">50袋</button>
        <button type="button" @click="quantity = 100">100袋</button>
        <button type="button" @click="quantity = 500">500袋</button>
      </div>
    </section>

    <p v-if="error" class="err">{{ error }}</p>
    <button class="save" type="button" :disabled="saving" @click="save">{{ saving ? '正在记' : '确认入库' }}</button>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { cnDate, specLabel, today } from '../format'
import Warehouses from '../components/Warehouses.vue'

const router = useRouter()
const platforms = ref([])
const products = ref([])
const rows = ref([])
const platformId = ref(undefined)
const variety = ref('')
const spec = ref('')
const custom = ref(false)
const quantity = ref('')
const error = ref('')
const saving = ref(false)

const varieties = computed(() => [...new Set(products.value.map((item) => item.variety))])
const specs = computed(() => [...new Set(products.value.filter((item) => item.variety === variety.value).map((item) => item.spec))])
const current = computed(() => rows.value.find((item) => item.variety === variety.value && item.spec === spec.value))

function bags(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}
function pickVariety(name) {
  custom.value = false
  variety.value = name
  const matched = products.value.filter((item) => item.variety === name)
  spec.value = matched.length === 1 ? matched[0].spec : ''
}
function startCustom() {
  custom.value = true
  variety.value = ''
  spec.value = ''
}
function setQuantity(raw) {
  quantity.value = String(raw).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
}
function bump(step) {
  quantity.value = String(Math.max(0, Number(quantity.value || 0) + step))
}

onMounted(async () => {
  const [meta, inventory] = await Promise.all([api('/api/meta'), api('/api/inventory')])
  platforms.value = meta.platforms
  products.value = meta.products
  rows.value = inventory.rows
})

async function save() {
  error.value = ''
  if (platformId.value == null) {
    error.value = '先选仓库'
    return
  }
  if (!String(variety.value).trim() || !String(spec.value).trim()) {
    error.value = '先选品种和规格'
    return
  }
  if (Number(quantity.value) <= 0) {
    error.value = '袋数要大于 0'
    return
  }
  saving.value = true
  try {
    await api('/api/inbounds', {
      method: 'POST',
      body: { bizDate: today(), variety: variety.value, spec: spec.value, platformId: platformId.value, quantity: quantity.value },
    })
    router.replace('/')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>
