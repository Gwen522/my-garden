<script setup>
import { ref, computed, onMounted } from 'vue'

const settings = ref(null)
const periods = ref([])
const nodes = ref([])
const error = ref('')
const mode = ref('light')
const zoom = ref(1)
const selected = ref(null)

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

// ---- 时间工具 ----
function parseDate(s) {
  if (!s) return null
  if (/^\d{4}-\d{2}$/.test(s)) return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, 1)
  return new Date(s)
}
function fmtDate(s) {
  const d = parseDate(s)
  if (!d) return ''
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`
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

// ---- 回廊 ----
const now = new Date()
const mainPeriods = computed(() =>
  periods.value.filter((p) => !p.parentId).sort((a, b) => parseDate(a.start) - parseDate(b.start))
)
const subPeriods = computed(() => periods.value.filter((p) => p.parentId))

function periodEnd(p) { return p.end ? parseDate(p.end) : now }
function periodYears(p) { return (periodEnd(p) - parseDate(p.start)) / (365.25 * 864e5) }
// 长度压缩：不按年份占比，1 + 0.1×时长（封顶6年）——前十八年不会占掉大半条线
function periodFlex(p) { return 1 + 0.1 * Math.min(periodYears(p) || 0, 6) }
function periodRange(p) { return `${fmtDate(p.start)} → ${p.end ? fmtDate(p.end) : '至今'}` }

function nodePeriod(n) {
  const d = parseDate(n.date)
  return mainPeriods.value.find((p) => d >= parseDate(p.start) && d <= periodEnd(p)) || null
}
function nodeRatio(n, p) {
  const d = parseDate(n.date), s = parseDate(p.start), e = periodEnd(p)
  return Math.min(Math.max((d - s) / (e - s), 0), 1)
}
function nodesIn(p) { return nodes.value.filter((n) => nodePeriod(n) === p) }
function subRange(sp, p) {
  const s = parseDate(sp.start), e = periodEnd(sp), ps = parseDate(p.start), pe = periodEnd(p)
  return [Math.max((s - ps) / (pe - ps), 0), Math.min((e - ps) / (pe - ps), 1)]
}
function windowBand(p) {
  const ps = parseDate(p.start), pe = periodEnd(p)
  const months = settings.value?.timeWindowMonths || 3
  const wStart = new Date(now.getTime() - months * 30.44 * 864e5)
  const a = Math.max((wStart - ps) / (pe - ps), 0)
  const b = Math.min((now - ps) / (pe - ps), 1)
  return a < b ? [a, b] : null
}
function parentName(id) {
  const p = periods.value.find((x) => x.id === id)
  return p ? p.name : ''
}
function select(kind, data) { selected.value = { kind, data } }

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
      <div class="corridor-head">
        <h2>回廊</h2>
        <div class="zoom">
          <button @click="zoom = Math.max(1, Number((zoom - 0.25).toFixed(2)))">−</button>
          <span>{{ zoom.toFixed(2) }}×</span>
          <button @click="zoom = Math.min(3, Number((zoom + 0.25).toFixed(2)))">＋</button>
        </div>
      </div>

      <div v-if="mainPeriods.length" class="track-wrap">
        <div class="track" :style="{ transform: `scale(${zoom})`, transformOrigin: 'left top' }">
          <div class="segs">
            <div v-for="p in mainPeriods" :key="p.id" class="seg"
                 :style="{ flex: periodFlex(p) + ' 1 0' }" @click="select('period', p)">
              <span class="seg-name">{{ p.name }}</span>
              <span class="seg-range">{{ periodRange(p) }}</span>
              <div v-if="windowBand(p)" class="band"
                   :style="{ left: windowBand(p)[0] * 100 + '%', width: (windowBand(p)[1] - windowBand(p)[0]) * 100 + '%' }"></div>
              <div v-for="sp in subPeriods.filter(s => s.parentId === p.id)" :key="sp.id" class="sub"
                   :style="{ left: subRange(sp, p)[0] * 100 + '%', width: (subRange(sp, p)[1] - subRange(sp, p)[0]) * 100 + '%' }"
                   @click.stop="select('period', sp)">{{ sp.name }}</div>
              <div v-for="n in nodesIn(p)" :key="n.id" class="ndot"
                   :style="{ left: nodeRatio(n, p) * 100 + '%' }" @click.stop="select('node', n)"></div>
              <div v-if="!p.end" class="nowline" style="left:100%"></div>
            </div>
          </div>
          <div class="ruler">
            <div v-for="p in mainPeriods" :key="'r' + p.id" class="ruler-cell" :style="{ flex: periodFlex(p) + ' 1 0' }">
              {{ p.start.slice(0, 4) }}<span v-if="p.end"> — {{ p.end.slice(0, 4) }}</span><span v-else> — 至今</span>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="hint">回廊还空着，去面板添加时期和节点吧。</p>

      <div v-if="selected" class="detail">
        <template v-if="selected.kind === 'period'">
          <h3>{{ selected.data.name }}<span class="meta-inline"> · {{ periodRange(selected.data) }}</span></h3>
          <p v-if="selected.data.parentId" class="meta">（{{ parentName(selected.data.parentId) }} 内的子时期）</p>
          <p>{{ selected.data.summary || '还没有概括。' }}</p>
        </template>
        <template v-else>
          <h3>{{ selected.data.title }}</h3>
          <p class="meta">{{ fmtDate(selected.data.date) }}<span v-if="selected.data.location"> · {{ selected.data.location }}</span></p>
          <p>{{ selected.data.desc || '还没有描述。' }}</p>
        </template>
      </div>
      <p v-else-if="mainPeriods.length" class="hint">点击时期或节点查看详情</p>
    </section>

    <footer>框架设计 v0.4 · 回廊 v1</footer>
  </div>
  <div v-else-if="error" class="page">{{ error }}</div>
  <div v-else class="page">加载中…</div>
</template>
