<template>
  <main class="phone">
    <header class="top">
      <div class="page-head">
        <img src="/icon-rec-in.jpg" alt="" />
        <div>
          <p class="eyebrow">丰冠农业</p>
          <h1>入库记录</h1>
        </div>
      </div>
      <router-link class="back" to="/">返回</router-link>
    </header>
    <div class="search-row">
      <input v-model="keyword" class="search" placeholder="搜品种" />
      <button v-if="keyword" type="button" @click="keyword = ''">清除</button>
    </div>
    <p v-if="!rows.length" class="empty">还没有入库。</p>
    <p v-else-if="!shown.length" class="empty">没有找到这个品种。</p>
    <p v-if="shown.length" class="range-note">共 {{ shown.length }} 笔</p>
    <article v-for="row in shown" :key="row.id" class="rec">
      <span class="avatar" :style="tintOf(row.variety)">{{ markOf(row.variety) }}</span>
      <div>
        <strong>{{ row.variety }} {{ row.spec }}</strong>
        <em>{{ cnDate(row.bizDate) }} · {{ short(row.platformName) }}</em>
      </div>
      <b>{{ bags(row.quantity) }} 袋</b>
    </article>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { cnDate, markOf, tintOf } from '../format'

const rows = ref([])
const keyword = ref('')
const shown = computed(() => rows.value.filter((row) => `${row.variety}${row.spec}${row.platformName}`.includes(keyword.value.trim())))

function bags(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}
function short(name) {
  return String(name || '').replace(/平台$/, '')
}

onMounted(async () => {
  rows.value = await api('/api/inbounds')
})
</script>
