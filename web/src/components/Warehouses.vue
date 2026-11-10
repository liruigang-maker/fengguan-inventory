<template>
  <p v-if="!platforms.length" class="retail">还没有库房，到管理里添加。</p>
  <div v-else class="tiles">
    <button
      v-for="item in platforms"
      :key="item.id"
      type="button"
      :class="{ on: modelValue === item.id }"
      @click="emit('update:modelValue', item.id)"
    >{{ short(item.name) }}</button>
  </div>
</template>

<script setup>
defineProps({
  platforms: { type: Array, required: true },
  modelValue: { default: undefined },
})
const emit = defineEmits(['update:modelValue'])

function short(name) {
  return String(name || '').replace(/平台$/, '')
}
</script>
