<script setup>
import { ref, computed, onMounted } from 'vue'

const settings = ref(null)
const post = ref(null)
const error = ref('')

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: text }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) {
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if (v.startsWith('[')) v = v.slice(1, -1).split(',').map(s => s.trim())
      meta[k] = v
    }
  }
  return { meta, body: m[2].trim() }
}

function renderMd(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = esc.split('\n')
  let html = ''
  let inList = false
  function closeList() { if (inList) { html += '</ul>'; inList = false } }
  for (const line of lines) {
    if (/^###\s/.test(line)) { closeList(); html += '<h3>' + line.slice(4) + '</h3>' }
    else if (/^##\s/.test(line)) { closeList(); html += '<h2>' + line.slice(3) + '</h2>' }
    else if (/^#\s/.test(line)) { closeList(); html += '<h1>' + line.slice(2) + '</h1>' }
    else if (/^[-*]\s/.test(line)) {
      if (!inList) { inList = true; html += '<ul>' }
      html += '<li>' + line.slice(2) + '</li>'
    }
    else if (line.trim() === '') { closeList() }
    else { closeList(); html += '<p>' + line + '</p>' }
  }
  closeList()
  return html
}

function calcAge(birthday) {
  if (!birthday) return null
  const b = new Date(birthday)
  const now = new Date()
  let y = now.getFullYear() - b.getFullYear()
  let m = now.getMonth() - b.getMonth()
  if (m < 0) { y--; m += 12 }
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

const timeWindowLabel = computed(() =>
  `${settings.value?.timeWindowMonths ?? 3} 个月`
)

onMounted(async () => {
  try {
    const [s, p] = await Promise.all([
      fetch('./content/settings.json'),
      fetch('./content/posts/0001-hello.md'),
    ])
    if (!s.ok) throw new Error('设置读取失败')
    if (!p.ok) throw new Error('第一篇日记读取失败')
    settings.value = await s.json()
    post.value = parseFrontmatter(await p.text())
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <div class="page" v-if="settings">
    <header class="hero">
      <h1>{{ settings.title }}</h1>
      <p class="about">{{ settings.about }}</p>
    </header>

    <section class="stats">
      <div class="stat">
        <span class="num">{{ ageText }}</span>
        <span class="label">年龄 · 自动计算</span>
      </div>
      <div class="stat">
        <span class="num">{{ siteDays }}</span>
        <span class="label">花园已建 · 自动计算</span>
      </div>
      <div class="stat">
        <span class="num">{{ timeWindowLabel }}</span>
        <span class="label">时间窗 · 可在面板调整</span>
      </div>
    </section>

    <section class="room">
      <h2>日记阁</h2>
      <article v-if="post" class="post">
        <h3>{{ post.meta.title }}</h3>
        <div class="meta">
          {{ post.meta.date }} · {{ post.meta.type }}
          <span v-if="post.meta.visible === 'private'" class="tag">仅自己</span>
        </div>
        <div class="body" v-html="renderMd(post.body)"></div>
      </article>
      <p v-else>还没有日记。</p>
    </section>

    <footer>框架设计 v0.1 · 更多房间建设中</footer>
  </div>
  <div v-else-if="error" class="page">{{ error }}</div>
  <div v-else class="page">加载中…</div>
</template>
