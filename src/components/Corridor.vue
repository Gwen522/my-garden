<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  periods: { type: Array, default: () => [] },
  nodes: { type: Array, default: () => [] },
  timeWindowMonths: { type: Number, default: 3 },
})

// ---------- 时间 ----------
const now = new Date()
function parse(s) {
  if (!s) return null
  if (/^\d{4}-\d{2}$/.test(s)) return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, 1)
  return new Date(s)
}
function fmt(s) {
  const d = parse(s)
  return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}` : ''
}
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const TRACK_W = 1500
const M = 20

const mainPeriods = computed(() =>
  props.periods.filter((p) => !p.parentId).sort((a, b) => parse(a.start) - parse(b.start)),
)
const subPeriods = computed(() => props.periods.filter((p) => p.parentId))

// ---------- 布局 ----------
const layout = computed(() => {
  const main = mainPeriods.value
  const sub = subPeriods.value
  const allNodes = props.nodes || []
  const endOf = (p) => (p.end ? parse(p.end) : now)
  const years = (p) => ((endOf(p) - parse(p.start)) / (365.25 * 864e5)) || 0
  const mainPeriodOf = (d) => main.find((p) => d >= parse(p.start) && d <= endOf(p)) || null
  const nodeCount = (p) => allNodes.filter((n) => mainPeriodOf(parse(n.date)) === p).length
  // 浓缩：已结束 + 年头久 + 无节点（没什么好讲的，如前十八年）
  const isCollapsed = (p) => !!(p.end && years(p) >= 10 && nodeCount(p) === 0)
  // 宽度：浓缩时期 ≈ 节点大小；其余固定短底宽，节点越多越撑开
  const flex = (p) => (isCollapsed(p) ? 0.35 : 1 + 0.25 * nodeCount(p))
  const total = main.reduce((s, p) => s + flex(p), 0) + 1
  let x = M
  const segs = main.map((p) => {
    const w = (flex(p) / total) * (TRACK_W - M * 2)
    const o = { p, left: x, width: w, right: x + w }
    x = o.right
    return o
  })
  const futureLeft = x
  const futureWidth = (1 / total) * (TRACK_W - M * 2)
  const segOf = (id) => segs.find((s) => s.p.id === id)
  const ratioIn = (d, seg) => {
    const s = parse(seg.p.start), e = endOf(seg.p)
    return Math.min(Math.max((d - s) / (e - s), 0), 1)
  }
  const xOfNode = (d) => {
    const mp = mainPeriodOf(d)
    const seg = mp && segOf(mp.id)
    return seg ? seg.left + ratioIn(d, seg) * seg.width : futureLeft
  }
  function yearAt(seg, year) {
    const y0 = parse(seg.p.start).getFullYear() + (parse(seg.p.start).getMonth() + 1) / 12
    const y1 = y0 + years(seg.p)
    return seg.left + ((year - y0) / (y1 - y0)) * seg.width
  }
  const openSeg = segs.find((s) => !s.p.end)
  const nowX = openSeg ? openSeg.right : 0

  // 此刻窗口带（「至今」区域）
  const wStart = new Date(now.getTime() - (props.timeWindowMonths || 3) * 30.44 * 864e5)
  let windowBand = null
  if (openSeg) {
    const a = Math.max((wStart - parse(openSeg.p.start)) / (endOf(openSeg.p) - parse(openSeg.p.start)), 0)
    windowBand = a < 1 ? { left: openSeg.left + a * openSeg.width, width: (1 - a) * openSeg.width } : null
  }

  // 时期气泡（主时期 + 子时期）
  const periodBubbles = []
  segs.forEach((s, i) => {
    periodBubbles.push({
      id: s.p.id, x: s.left + s.width / 2, w: isCollapsed(s.p) ? 138 : 190,
      compact: isCollapsed(s.p), colorIdx: i,
      name: s.p.name,
      range: fmt(s.p.start) + ' → ' + (s.p.end ? fmt(s.p.end) : '至今'),
      summary: s.p.summary || '',
    })
  })
  const subItems = []
  sub.forEach((sp, i) => {
    const seg = segOf(sp.parentId)
    if (!seg) return
    const a = ratioIn(parse(sp.start), seg)
    const b = ratioIn(endOf(sp), seg)
    subItems.push({ p: sp, left: seg.left + a * seg.width, width: (b - a) * seg.width, colorIdx: main.length + i })
    periodBubbles.push({
      id: sp.id, x: seg.left + ((a + b) / 2) * seg.width, w: 190, compact: false,
      colorIdx: main.length + i,
      name: sp.name,
      range: fmt(sp.start) + ' → ' + (sp.end ? fmt(sp.end) : '至今'),
      summary: sp.summary || '',
    })
  })

  // 节点（今天的节点由「至今」箭头承担，不重复出）
  const nodeItems = allNodes
    .map((n) => {
      const d = parse(n.date)
      return d ? { ...n, x: xOfNode(d), atNow: sameDay(d, now) } : null
    })
    .filter(Boolean)
  const visNodes = nodeItems.filter((n) => !n.atNow)

  // 刻度（对齐压缩后的段落边界）
  const ticks = []
  ticks.push({ x: M, label: '2005' })
  if (segs[0] && segs[0].width > 240) [2010, 2015, 2020].forEach((y) => ticks.push({ x: yearAt(segs[0], y), label: String(y) }))
  segs.slice(0, -1).forEach((s) => { if (s.p.end) ticks.push({ x: s.right, label: String(parse(s.p.end).getFullYear()) }) })
  if (segs[1] && segs[1].width > 240) { ticks.push({ x: yearAt(segs[1], 2024), label: '2024' }); ticks.push({ x: yearAt(segs[1], 2025), label: '2025' }) }
  ticks.push({ x: nowX, label: '现在', future: true })
  ticks.push({ x: futureLeft + futureWidth, label: '未来', future: true })

  return { segs, subItems, futureLeft, futureWidth, nowX, windowBand, periodBubbles, nodeItems, visNodes, ticks }
})

// ---------- 气泡分层：全部从最底层开始，挤不下才抬升/下沉 ----------
const offsets = computed(() => {
  const up = {}
  const down = {}
  function assign(list, gap, step, base) {
    const sorted = [...list].sort((a, b) => a.x - b.x)
    const bands = []
    const out = {}
    for (const it of sorted) {
      let bi = 0
      while (bands[bi] && bands[bi].some((p) => it.x - it.w / 2 < p.r + gap && it.x + it.w / 2 > p.l - gap)) bi++
      if (!bands[bi]) bands[bi] = []
      bands[bi].push({ l: it.x - it.w / 2, r: it.x + it.w / 2 })
      out[it.id] = base + bi * step
    }
    return out
  }
  const pb = layout.value.periodBubbles.map((b) => ({ id: b.id, x: b.x, w: b.w }))
  const nb = layout.value.visNodes.map((n) => ({ id: n.id, x: n.x, w: 138 }))
  Object.assign(up, assign(pb, 26, 80, 30))
  Object.assign(down, assign(nb, 20, 84, 30))
  return { up, down }
})

// ---------- 交互 ----------
const stripRef = ref(null)
const scale = ref(1.4)
const tx = ref(0)
const ty = ref(0)
const drag = ref(null)
const hoverId = ref(null)
const focusId = ref(null)

const worldTransform = computed(() => `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`)
const cw = () => (stripRef.value ? stripRef.value.offsetWidth : 600)
const colorVar = (i) => `var(--c${(i % 5) + 1})`
const isBig = (id) => hoverId.value === id || focusId.value === id
const toggleFocus = (id) => { focusId.value = focusId.value === id ? null : id }

function clamp() {
  const w = stripRef.value.offsetWidth
  const h = stripRef.value.offsetHeight
  const minT = Math.min(0, w - TRACK_W * scale.value)
  const maxT = Math.max(0, w * 0.12)
  tx.value = Math.min(maxT, Math.max(minT, tx.value))
  const minY = Math.min(0, h - h * scale.value)
  ty.value = Math.min(20, Math.max(minY, ty.value))
}
function zoomAt(mx, factor) {
  const ns = Math.min(3.2, Math.max(0.7, scale.value * factor))
  const wx = (mx - tx.value) / scale.value
  tx.value = mx - wx * ns
  scale.value = ns
  clamp()
}
// 初始/复位：整条时间线铺满画廊宽度
function applyView() {
  if (!stripRef.value) return
  const w = cw()
  scale.value = Math.max(0.6, w / 1600)
  tx.value = (w - TRACK_W * scale.value) / 2
  ty.value = 0
  clamp()
}
function onWheel(e) {
  e.preventDefault()
  const r = stripRef.value.getBoundingClientRect()
  zoomAt(e.clientX - r.left, e.deltaY < 0 ? 1.08 : 0.92)
}
function onDown(e) {
  const r = stripRef.value.getBoundingClientRect()
  drag.value = { id: e.pointerId, x: e.clientX - r.left - tx.value, y: e.clientY - r.top - ty.value }
  try { stripRef.value.setPointerCapture(e.pointerId) } catch (_) {}
  stripRef.value.classList.add('dragging')
}
function onMove(e) {
  if (!drag.value || drag.value.id !== e.pointerId) return
  const r = stripRef.value.getBoundingClientRect()
  tx.value = e.clientX - r.left - drag.value.x
  ty.value = e.clientY - r.top - drag.value.y
  clamp()
}
function onUp(e) {
  if (drag.value && drag.value.id === e.pointerId) {
    drag.value = null
    stripRef.value.classList.remove('dragging')
  }
}
function onTrackClick(e) {
  if (e.target && e.target.classList && e.target.classList.contains('c-track')) focusId.value = null
}

onMounted(() => {
  applyView()
  const el = stripRef.value
  if (!el) return
  // 原生监听（与 demo 同款），确保滚轮缩放/拖拽在各类浏览器中都生效
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('dblclick', applyView)
  window.addEventListener('resize', applyView)
})
onBeforeUnmount(() => {
  const el = stripRef.value
  if (el) {
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('dblclick', applyView)
  }
  window.removeEventListener('resize', applyView)
})
</script>

<template>
  <div class="corridor">
    <div class="corridor-head">
      <h2>回廊</h2>
      <div class="corridor-tools">
        <span class="c-hint">滚轮缩放 · 拖拽平移 · 悬停/点击气泡</span>
        <div class="zoom">
          <button @click="zoomAt(cw() / 2, 1 / 1.2)">−</button>
          <span>{{ Math.round(scale * 100) }}%</span>
          <button @click="zoomAt(cw() / 2, 1.2)">＋</button>
          <button @click="applyView">复位</button>
        </div>
      </div>
    </div>

    <div v-if="layout.segs.length" ref="strip" class="c-strip">
      <div class="c-world" :style="{ transform: worldTransform }">
        <div class="c-track" @click="onTrackClick">
          <div class="c-ribbon"></div>

          <!-- 时期丝线 -->
          <div v-for="(s, i) in layout.segs" :key="'t' + s.p.id" class="c-thread"
               :class="{ hot: isBig(s.p.id) }"
               :style="{ left: s.left + 'px', width: s.width + 'px', background: colorVar(i) }"></div>
          <div v-for="sp in layout.subItems" :key="'st' + sp.p.id" class="c-thread c-sub"
               :style="{ left: sp.left + 'px', width: sp.width + 'px', background: colorVar(sp.colorIdx) }"></div>
          <div class="c-thread c-future"
               :style="{ left: layout.futureLeft + 'px', width: layout.futureWidth + 'px' }"></div>

          <!-- 此刻窗口带 -->
          <div v-if="layout.windowBand" class="c-window"
               :style="{ left: layout.windowBand.left + 'px', width: layout.windowBand.width + 'px' }"></div>

          <!-- 时期热区 -->
          <div v-for="s in layout.segs" :key="'h' + s.p.id" class="c-hit"
               :style="{ left: s.left + 'px', width: s.width + 'px' }"
               @mouseenter="hoverId = s.p.id" @mouseleave="hoverId = null" @click.stop="toggleFocus(s.p.id)"></div>
          <div v-for="sp in layout.subItems" :key="'hs' + sp.p.id" class="c-hit"
               :style="{ left: sp.left + 'px', width: sp.width + 'px' }"
               @mouseenter="hoverId = sp.p.id" @mouseleave="hoverId = null" @click.stop="toggleFocus(sp.p.id)"></div>

          <!-- 时期气泡（常驻） -->
          <div v-for="b in layout.periodBubbles" :key="'b' + b.id" class="c-bubble"
               :class="{ compact: b.compact, big: isBig(b.id) }"
               :style="{ left: b.x + 'px', '--up': (offsets.up[b.id] || 30) + 'px' }"
               @mouseenter="hoverId = b.id" @mouseleave="hoverId = null" @click.stop="toggleFocus(b.id)">
            <div class="b-name" :style="{ color: colorVar(b.colorIdx) }">{{ b.name }}</div>
            <div class="b-range">{{ b.range }}</div>
            <div v-if="b.summary" class="b-text">{{ b.summary }}</div>
          </div>

          <!-- 节点：珠子 + 命中圈 + 下方气泡 -->
          <template v-for="n in layout.visNodes" :key="n.id">
            <div class="c-dot" :style="{ left: n.x + 'px' }"
                 @mouseenter="hoverId = n.id" @mouseleave="hoverId = null" @click.stop="toggleFocus(n.id)"></div>
            <div class="c-dot-hit" :style="{ left: n.x + 'px' }"
                 @mouseenter="hoverId = n.id" @mouseleave="hoverId = null" @click.stop="toggleFocus(n.id)"></div>
            <div class="c-bubble c-node" :class="{ big: isBig(n.id) }"
                 :style="{ left: n.x + 'px', '--drop': (offsets.down[n.id] || 30) + 'px' }"
                 @mouseenter="hoverId = n.id" @mouseleave="hoverId = null" @click.stop="toggleFocus(n.id)">
              <div class="b-name">{{ n.title }}</div>
              <div class="b-range">{{ fmt(n.date) }}{{ n.location ? ' · ' + n.location : '' }}</div>
              <div v-if="n.desc" class="b-desc">{{ n.desc }}</div>
            </div>
          </template>

          <!-- 至今箭头 -->
          <div class="c-now-arrow" :style="{ left: layout.nowX + 'px' }"></div>
          <div class="c-now-tag" :style="{ left: layout.nowX + 'px' }">至今</div>

          <!-- 刻度 -->
          <div class="c-axis">
            <div v-for="(t, i) in layout.ticks" :key="i" class="c-tick"
                 :class="{ future: t.future }" :style="{ left: t.x + 'px' }">{{ t.label }}</div>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="hint">回廊还空着，去面板添加时期和节点吧。</p>
  </div>
</template>

<style scoped>
.corridor { width: 100%; }
.corridor-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin: 0 auto 14px;
  padding: 0 20px;
  max-width: 720px;
  flex-wrap: wrap;
}
.corridor-tools { text-align: right; }
.c-hint { font-size: 11px; color: var(--text-2); margin-top: 4px; display: block; }
.zoom { display: flex; align-items: center; gap: 6px; margin-top: 4px; justify-content: flex-end; }
.zoom button {
  width: 28px; height: 28px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-2);
  font-size: 14px;
  cursor: pointer;
}
.zoom button:hover { color: var(--accent); border-color: var(--accent); }
.zoom span { font-size: 11px; color: var(--text-2); min-width: 40px; text-align: center; }

.c-strip {
  position: relative;
  width: 100%;
  height: 540px;
  overflow: hidden;
  background: transparent;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.c-strip.dragging { cursor: grabbing; }
.c-world { position: absolute; inset: 0; transform-origin: 0 0; will-change: transform; }
.c-track { position: absolute; left: 0; top: 0; width: 1500px; height: 100%; }

.c-ribbon {
  position: absolute; left: 20px; right: 20px;
  top: calc(46% - 5px); height: 10px;
  border-radius: 999px;
  background: var(--band);
  box-shadow: inset 0 0 0 1px var(--hair);
}
.c-thread {
  position: absolute; top: 46%; height: 3px;
  border-radius: 999px;
  transform: translateY(-50%);
  box-shadow: 0 0 10px var(--glow);
  transition: filter 0.2s;
}
.c-thread.hot { filter: brightness(1.25); }
.c-thread.c-sub { top: calc(46% - 14px); }
.c-thread.c-future { border: 1px dashed var(--hair); background: transparent !important; box-shadow: none; }

.c-window {
  position: absolute; top: 46%; height: 22px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--glow);
  border-left: 1px solid var(--hair);
  border-right: 1px solid var(--hair);
}

.c-hit {
  position: absolute; top: 46%; height: 60px;
  transform: translateY(-50%);
  cursor: pointer;
  border-radius: 10px;
  z-index: 2;
}
.c-hit:hover { background: var(--glow); }

.c-dot {
  position: absolute; top: 46%;
  width: 11px; height: 11px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: var(--card);
  border: 2.5px solid var(--c-now);
  cursor: pointer;
  z-index: 3;
  transition: transform 0.2s;
}
.c-dot:hover { transform: translate(-50%, -50%) scale(1.6); }
.c-dot-hit {
  position: absolute; top: 46%;
  width: 44px; height: 44px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: pointer;
  z-index: 4;
}

.c-now-arrow {
  position: absolute; left: 0; top: 46%;
  width: 0; height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-left: 16px solid var(--c-now);
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 0 6px var(--c-now));
  animation: c-pulse 2.4s ease-in-out infinite;
  z-index: 5;
}
@keyframes c-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.c-now-tag {
  position: absolute; left: 24px; top: 46%;
  transform: translateY(-50%);
  font-size: 10px; letter-spacing: 2px;
  color: var(--c-now);
  background: var(--card);
  border: 1px solid var(--c-now);
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
  z-index: 5;
}

.c-bubble {
  position: absolute;
  left: 0; top: 46%;
  width: 190px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
  padding: 11px 13px;
  cursor: pointer;
  transform: translate(-50%, calc(-100% - var(--up, 30px)));
  transition: transform 0.22s, box-shadow 0.22s, border-color 0.22s;
  z-index: 6;
}
.c-bubble::before {
  content: '';
  position: absolute; left: 50%;
  top: calc(100% + 7px);
  width: 1px;
  height: calc(var(--up, 30px) - 16px);
  background: var(--hair);
  opacity: 0.45;
}
.c-bubble::after {
  content: '';
  position: absolute;
  left: 50%; bottom: -7px;
  width: 13px; height: 13px;
  background: var(--card);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  transform: translateX(-50%) rotate(45deg);
}
.c-bubble.big {
  transform: translate(-50%, calc(-100% - var(--up, 30px))) scale(1.04);
  border-color: var(--accent);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.12);
  z-index: 7;
}
.b-name { font-family: var(--font-serif); font-size: 14px; font-weight: 700; letter-spacing: 2px; }
.b-range { font-size: 10px; color: var(--text-2); margin: 2px 0 6px; }
.b-text { font-size: 11px; color: var(--text-2); line-height: 1.55; }

.c-bubble.compact { width: 138px; padding: 9px 11px; }
.c-bubble.compact .b-name { font-size: 12px; }

/* 节点气泡：带子下方，尾巴朝上 */
.c-bubble.c-node {
  width: 138px;
  padding: 9px 11px;
  transform: translate(-50%, calc(100% + var(--drop, 30px)));
}
.c-bubble.c-node::before {
  top: calc(-1 * (var(--drop, 30px) - 8px));
  height: calc(var(--drop, 30px) - 8px);
}
.c-bubble.c-node::after {
  top: -7px; bottom: auto;
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
  border-right: none; border-bottom: none;
}
.c-bubble.c-node.big { transform: translate(-50%, calc(100% + var(--drop, 30px))) scale(1); }
.c-bubble.c-node .b-name { font-size: 12px; }
.c-bubble.c-node .b-desc { display: none; margin-top: 5px; }
.c-bubble.c-node.big { width: 172px; }
.c-bubble.c-node.big .b-desc { display: block; }

.c-axis { position: absolute; left: 20px; right: 20px; top: 86%; height: 30px; }
.c-tick {
  position: absolute;
  font-size: 10px; color: var(--text-2);
  letter-spacing: 1px;
  transform: translateX(-50%);
}
.c-tick::before {
  content: '';
  position: absolute; left: 50%; top: -6px;
  width: 1px; height: 6px;
  background: var(--hair);
}
.c-tick.future { opacity: 0.6; }

.hint { font-size: 11px; color: var(--text-2); margin-top: 12px; }
</style>
