const $ = (id) => document.getElementById(id)

const TYPE_LABEL = { diary: '日记', essay: '随笔', game: '游戏', anime: '动漫', travel: '足迹', poetry: '诗词' }

async function api(path, opts) {
  const res = await fetch(path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

function today() { return new Date().toISOString().slice(0, 10) }

async function loadSettings() {
  const s = await api('/api/settings')
  $('sTitle').value = s.title || ''
  $('sAbout').value = s.about || ''
  $('sBirthday').value = s.birthday || ''
  $('sWindow').value = String(s.timeWindowMonths || 3)
  $('sTheme').value = s.theme || 'paper'
  $('siteName').textContent = s.title || '管理面板'
  document.body.dataset.theme = s.theme || 'paper'
}

async function loadPosts() {
  const posts = await api('/api/posts')
  $('postCount').textContent = `（${posts.length} 篇）`
  $('emptyTip').hidden = posts.length > 0
  const ul = $('postList')
  ul.innerHTML = ''
  for (const p of posts.reverse()) {
    const li = document.createElement('li')
    li.className = 'post-item'
    const info = document.createElement('div')
    info.className = 'post-info'
    const t = document.createElement('div')
    t.className = 'post-title'
    t.textContent = p.title
    const m = document.createElement('div')
    m.className = 'post-meta'
    m.textContent = `${p.date || '?'} · ${TYPE_LABEL[p.type] || p.type}${p.visible === 'public' ? ' · 公开' : ' · 仅自己'}`
    info.append(t, m)
    const del = document.createElement('button')
    del.className = 'btn-del'
    del.textContent = '删除'
    del.onclick = async () => {
      if (!confirm(`删除《${p.title}》？`)) return
      await api(`/api/posts?name=${encodeURIComponent(p.name)}`, { method: 'DELETE' })
      await loadPosts()
      await refreshStatus()
    }
    li.append(info, del)
    ul.append(li)
  }
}

async function refreshStatus() {
  try {
    const s = await api('/api/status')
    $('statusDot').className = 'dot ' + (s.dirty ? 'dirty' : 'clean')
    $('statusText').textContent = s.dirty ? `有 ${s.changes.length} 个改动未发布` : '已同步'
  } catch (e) {
    $('statusText').textContent = e.message
  }
}

async function init() {
  $('fDate').value = today()
  await loadSettings()
  await loadPosts()
  await refreshStatus()
}

$('postForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  try {
    await api('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: $('fTitle').value.trim(),
        date: $('fDate').value,
        type: $('fType').value,
        visible: $('fVisible').value,
        tags: $('fTags').value,
        body: $('fBody').value,
      }),
    })
    $('fTitle').value = ''
    $('fTags').value = ''
    $('fBody').value = ''
    $('fDate').value = today()
    alert('已保存到本地。点右上角「保存并发布」即可上线。')
    await loadPosts()
    await refreshStatus()
  } catch (err) {
    alert(err.message)
  }
})

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  try {
    await api('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: $('sTitle').value.trim(),
        about: $('sAbout').value.trim(),
        birthday: $('sBirthday').value,
        timeWindowMonths: Number($('sWindow').value),
        theme: $('sTheme').value,
      }),
    })
    $('siteName').textContent = $('sTitle').value.trim() || '管理面板'
    document.body.dataset.theme = $('sTheme').value
    alert('设置已保存。点「保存并发布」即可上线。')
    await refreshStatus()
  } catch (err) {
    alert(err.message)
  }
})

$('publishBtn').addEventListener('click', async () => {
  $('publishBtn').disabled = true
  $('publishBtn').textContent = '发布中…'
  try {
    const r = await api('/api/push', { method: 'POST' })
    alert('已发布：' + (r.commit || '') + ' / ' + (r.push || '已同步'))
    await refreshStatus()
  } catch (err) {
    alert('发布失败：' + err.message)
  } finally {
    $('publishBtn').disabled = false
    $('publishBtn').textContent = '保存并发布'
  }
})

$('themeToggle').addEventListener('click', () => {
  const cur = document.body.dataset.theme
  document.body.dataset.theme = cur === 'neon' ? 'paper' : 'neon'
  $('sTheme').value = document.body.dataset.theme
})

init()
