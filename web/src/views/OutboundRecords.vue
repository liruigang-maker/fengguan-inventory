<template>
  <main class="phone">
    <header class="top">
      <div class="page-head">
        <img src="/icon-rec-out.jpg" alt="" />
        <div>
          <p class="eyebrow">丰冠农业</p>
          <h1>出库记录</h1>
        </div>
      </div>
      <router-link class="back" to="/">返回</router-link>
    </header>
    <div class="search-row">
      <input v-model="keyword" class="search" placeholder="搜客户、品种、电话" />
      <button v-if="keyword" type="button" @click="keyword = ''">清除</button>
    </div>
    <p v-if="!rows.length" class="empty">还没有出库。</p>
    <p v-else-if="!groups.length" class="empty">没有找到。</p>
    <p v-else class="range-note">共 {{ groups.length }} 人 · {{ shown.length }} 笔</p>

    <article v-for="group in groups" :key="group.key" class="person">
      <button type="button" class="person-head" @click="toggle(group.key)">
        <span class="avatar" :style="tintOf(group.name)">{{ markOf(group.name) }}</span>
        <span class="person-main">
          <strong>{{ group.name }}</strong>
          <em>{{ group.phone || '没填电话' }} · {{ group.rows.length }} 笔</em>
        </span>
        <b>{{ bags(group.bags) }} 袋</b>
        <i>{{ open[group.key] ? '收起' : '展开' }}</i>
      </button>
      <div v-if="open[group.key]" class="person-lines">
        <div v-for="row in group.rows" :key="row.id" class="person-line">
          <div>
            <strong>{{ cnDate(row.bizDate) }} · {{ row.variety || '只记回款' }} {{ specLabel(row.spec) }}</strong>
            <em>{{ place(row) }} · {{ short(row.platformName) }}</em>
            <em v-if="row.receivedAmount">回款 {{ money(row.receivedAmount) }} 元 {{ row.paymentMethodName }}</em>
          </div>
          <b>{{ bags(row.orderBags) }} 袋</b>
        </div>
      </div>
    </article>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { cnDate, markOf, specLabel, tintOf } from '../format'

const rows = ref([])
const keyword = ref('')
const open = ref({})

const shown = computed(() => {
  const text = keyword.value.trim()
  return rows.value.filter((row) => `${row.customerName}${row.phone}${row.variety}${row.spec}${row.platformName}`.includes(text))
})

const groups = computed(() => {
  const map = new Map()
  for (const row of shown.value) {
    const key = row.phone ? `p:${row.phone}` : `n:${row.customerName || '未填客户'}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: row.customerName || '未填客户',
        phone: row.phone || '',
        rows: [],
        bags: 0,
      })
    }
    const group = map.get(key)
    group.rows.push(row)
    group.bags += Number(row.orderBags || 0)
  }
  return [...map.values()]
})

function bags(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}
function money(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}
function place(row) {
  return [row.province, row.city, row.district, row.town].filter(Boolean).join('') || '没填地址'
}
function short(name) {
  return String(name || '').replace(/平台$/, '') || '零售/其他'
}
function toggle(key) {
  open.value = { ...open.value, [key]: !open.value[key] }
}

onMounted(async () => {
  rows.value = await api('/api/outbounds')
})
</script>
