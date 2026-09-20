<script setup>
import { ref, computed, onMounted } from 'vue'
import Corridor from './components/Corridor.vue'

const settings = ref(null)
const periods = ref([])
const nodes = ref([])
const error = ref('')
const mode = ref('light')

// 主题：风格（settings.theme）+ 明暗（访客按钮，本地记住）
function applyTheme() {
  const t = settings.value?.theme || 'paper'
  document.body.dataset.theme = t
  const saved = localStorage.getItem('garden-mode')
  mode.value = saved || (t === 'neon' ? 'dark' : 'light')
  document.body.dataset.mode = mode.value
}
function toggleMode() {
  mode.value = mode.value === 'dark' ? 'light' : 'dark'
  document.body.dataset.mode = mode.value
  localStorage.setItem('garden-mode', mode.value)
}

// ---- 动态数字 ----
function calcAge(birthday) {
  if (!birthday) return null
  const b = new Date(birthday)
  const n = new Date()
  let y = n.getFullYear() - b.getFullYear()
  let m = n.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) { y--; m += 12 }
  if (n.getDate() < b.getDate()) m--
  return { y, m }
}
const ageText = computed(() => {
  const a = calcAge(settings.value?.birthday)
  return a ? `${a.y} 岁 ${a.m} 个月` : '待填写'
})
const siteDays = computed(() => {
  if (!settings.value?.siteCreated) return '待填写'
  const s = new Date(settings.value.siteCreated)
  const d = Math.floor((new Date() - s) / 86400000)
  return d >= 0 ? `${d} 天` : '待填写'
})

onMounted(async () => {
  try {
    const [s, pp, nn] = await Promise.all([
      fetch('./content/settings.json'),
      fetch('./content/periods.json').catch(() => null),
      fetch('./content/nodes.json').catch(() => null),
    ])
    if (!s.ok) throw new Error('设置读取失败')
    settings.value = await s.json()
    periods.value = pp?.ok ? await pp.json() : []
    nodes.value = nn?.ok ? await nn.json() : []
    applyTheme()
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <div class="page" v-if="settings">
    <button class="mode-toggle" @click="toggleMode" :title="mode === 'dark' ? '切到白天' : '切到黑夜'">
      {{ mode === 'dark' ? '昼' : '夜' }}
    </button>

    <header class="hero">
      <img v-if="settings.avatar" class="avatar" :src="settings.avatar" alt="头像" />
      <div>
        <h1 class="garden-name">{{ settings.title }}</h1>
        <p v-if="settings.nickname" class="nickname">{{ settings.nickname }}</p>
        <ul v-if="settings.attrs && settings.attrs.length" class="attrs">
          <li v-for="a in settings.attrs" :key="a[0]">
            <span class="attr-k">{{ a[0] }}</span><span class="attr-v">{{ a[1] }}</span>
          </li>
        </ul>
        <p v-if="settings.currentStatus" class="status">{{ settings.currentStatus }}</p>
      </div>
    </header>

    <section class="stats">
      <div class="stat">
        <span class="num">{{ ageText }}</span>
        <span class="label">年龄 · 自动计算</span>
      </div>
      <div class="stat">
        <span class="num">{{ siteDays }}</span>
        <span class="label">建站 · 自动计算</span>
      </div>
    </section>

    <section class="room corridor">
      <Corridor
        :periods="periods"
        :nodes="nodes"
        :time-window-months="settings.timeWindowMonths || 3"
      />
    </section>

    <footer>框架设计 v0.4 · 回廊 v2</footer>
  </div>
  <div v-else-if="error" class="page">{{ error }}</div>
  <div v-else class="page">加载中…</div>
</template>
