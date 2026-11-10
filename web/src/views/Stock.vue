<template>
  <main class="phone home">
    <header class="home-head">
      <div class="home-brand">
        <img src="/brand.jpg" alt="" />
        <div>
          <strong>丰冠农业</strong>
          <span>库存</span>
        </div>
      </div>
      <div class="home-pills">
        <router-link to="/manage">管理</router-link>
        <button type="button" @click="logout">退出</button>
      </div>
    </header>
    <div class="home-body">
    <section v-if="loaded" class="summary">
      <span>全部库存</span>
      <strong :class="{ neg: grand < 0 }">{{ bags(grand) }}</strong>
      <em>袋 · {{ rows.length }} 个品种 · {{ platforms.length }} 个库房</em>
    </section>
    <nav class="jumps">
      <router-link to="/records/in"><img src="/icon-rec-in.jpg" alt="" /><span>入库记录</span></router-link>
      <router-link to="/records/out"><img src="/icon-rec-out.jpg" alt="" /><span>出库记录</span></router-link>
      <router-link to="/payments"><img src="/icon-pay.jpg" alt="" /><span>回款</span></router-link>
    </nav>

    <p v-if="!loaded" class="empty">正在看库存…</p>
    <p v-else-if="!rows.length" class="empty">还没有货。<br>点下面的入库或出库开始记。</p>
    <div v-if="loaded && (rows.length || platforms.length)" class="seg two">
      <button type="button" :class="{ on: view === 'product' }" @click="view = 'product'">
        <img src="/icon-variety.jpg" alt="" />按品种
      </button>
      <button type="button" :class="{ on: view === 'house' }" @click="view = 'house'">
        <img src="/icon-house.jpg" alt="" />按库房
      </button>
    </div>

    <template v-if="view === 'house'">
      <article v-for="house in houses" :key="house.id" class="stock">
        <div class="stock-name">
          <div class="stock-id">
            <img class="kind-icon" src="/icon-house.jpg" alt="" />
            <strong>{{ short(house.name) }}</strong>
          </div>
          <span class="house-total">{{ bags(house.total) }} 袋</span>
        </div>
        <p v-if="!house.items.length" class="retail">这个库没有货</p>
        <div v-for="item in house.items" :key="item.variety + item.spec" class="house-line" :class="{ low: item.qty < 100 }">
          <span class="plat-name">
            <img src="/icon-variety.jpg" alt="" />
            <span>{{ item.variety }}<small>{{ specLabel(item.spec) }}</small></span>
          </span>
          <b :class="{ neg: item.qty < 0 }">
            <em v-if="item.qty < 100">库存不足</em>
            {{ bags(item.qty) }} 袋
          </b>
        </div>
      </article>
    </template>
    <article v-for="row in rows" v-else :key="row.productId" class="stock" :class="{ low: row.total < 100 }">
      <div class="stock-name">
        <div class="stock-id">
          <img class="kind-icon" src="/icon-variety.jpg" alt="" />
          <div>
            <strong>{{ row.variety }}</strong>
            <span class="spec-chip">{{ specLabel(row.spec) }}</span>
          </div>
        </div>
        <p class="stock-num" :class="{ neg: row.total < 0 }">
          <em v-if="row.total < 100" class="low-tag">库存不足</em>
          <b>{{ bags(row.total) }}</b>
          <span>袋</span>
        </p>
      </div>
      <div class="plats">
        <div v-for="item in platforms" :key="item.id">
          <span class="plat-name"><img src="/icon-house.jpg" alt="" />{{ short(item.name) }}</span>
          <strong :class="{ neg: row.platformQty[item.id] < 0 }">{{ bags(row.platformQty[item.id]) }}</strong>
        </div>
      </div>
      <p v-if="row.retailOut" class="retail">以前没选库房的出库 {{ bags(row.retailOut) }} 袋，已经从总数里减去</p>
    </article>

    <button v-if="loaded" class="danger-link" type="button" @click="openClear">清空全部数据</button>
    </div>

    <nav class="dock">
      <router-link to="/inbound">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M5 20h14"/></svg>
        入库
      </router-link>
      <router-link to="/outbound">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14V4"/><path d="M8 8l4-4 4 4"/><path d="M5 20h14"/></svg>
        出库
      </router-link>
    </nav>

    <div v-if="clearOpen" class="mask" @click.self="clearOpen = false">
      <form class="sheet" @submit.prevent="confirmClear">
        <h2>清空全部数据</h2>
        <p>入库、出库、回款和客户都会删掉，删了不能恢复。库房和登录账号会留下。</p>
        <input v-model="clearPassword" type="password" autocomplete="current-password" placeholder="输入登录密码" />
        <p v-if="clearError" class="err">{{ clearError }}</p>
        <div class="sheet-actions">
          <button type="button" @click="clearOpen = false">取消</button>
          <button class="danger" type="submit" :disabled="clearBusy || !clearPassword">确认清空</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { specLabel } from '../format'

const router = useRouter()
const loaded = ref(false)
const view = ref('product')
const platforms = ref([])
const rows = ref([])
const clearOpen = ref(false)
const clearPassword = ref('')
const clearError = ref('')
const clearBusy = ref(false)

const grand = computed(() => rows.value.reduce((sum, row) => sum + Number(row.total || 0), 0))
const houses = computed(() => platforms.value.map((platform) => {
  const items = rows.value
    .map((row) => ({ variety: row.variety, spec: row.spec, qty: Number(row.platformQty[platform.id] || 0) }))
    .filter((item) => item.qty !== 0)
  return { ...platform, items, total: items.reduce((sum, item) => sum + item.qty, 0) }
}))

function bags(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}
function short(name) {
  return String(name).replace(/平台$/, '')
}

async function logout() {
  await api('/api/logout', { method: 'POST' })
  router.push('/login')
}

async function load() {
  const data = await api('/api/inventory')
  platforms.value = data.platforms
  rows.value = data.rows
  loaded.value = true
}

function openClear() {
  clearPassword.value = ''
  clearError.value = ''
  clearOpen.value = true
}

async function confirmClear() {
  clearError.value = ''
  clearBusy.value = true
  try {
    await api('/api/data/clear', { method: 'POST', body: { password: clearPassword.value } })
    clearOpen.value = false
    await load()
  } catch (error) {
    clearError.value = error.message
  } finally {
    clearBusy.value = false
  }
}

onMounted(load)
</script>
