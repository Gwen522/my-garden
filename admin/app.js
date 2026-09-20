const $ = (id) => document.getElementById(id)

async function api(path, opts) {
  const res = await fetch(path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

function attrsToText(attrs) {
  return (attrs || []).map((a) => `${a[0]}：${a[1] ?? ''}`).join('\n')
}

function textToAttrs(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.search(/[：:]/)
      return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']
    })
}

async function loadSettings() {
  const s = await api('/api/settings')
  $('sTitle').value = s.title || ''
  $('sNickname').value = s.nickname || ''
  $('sStatus').value = s.currentStatus || ''
  $('sAttrs').value = attrsToText(s.attrs)
  $('sAvatar').value = s.avatar || ''
  $('sBirthday').value = s.birthday || ''
  $('sWindow').value = String(s.timeWindowMonths || 3)
  $('sTheme').value = s.theme || 'paper'
  $('siteName').textContent = s.title || '管理面板'
  $('siteCreatedLine').textContent = s.siteCreated ? `建站日：${s.siteCreated}（自动记录，无需修改）` : ''
}

async function refreshStatus() {
  try {
    const st = await api('/api/status')
    $('statusDot').className = 'dot ' + (st.dirty ? 'dirty' : 'clean')
    $('statusText').textContent = st.dirty ? `有 ${st.changes.length} 个改动未发布` : '已同步'
  } catch (e) {
    $('statusText').textContent = e.message
  }
}

// ---- 时期 / 节点 ----
async function loadPeriods() {
  const list = await api('/api/periods')
  $('periodCount').textContent = `（${list.length} 个）`
  const ul = $('periodList')
  ul.innerHTML = ''
  // 主时期选项（嵌套时期不能作为父级）
  const sel = $('pParent')
  sel.innerHTML = '<option value="">— 主时期 —</option>'
  for (const p of list.filter((x) => !x.parentId)) {
    const o = document.createElement('option')
    o.value = p.id
    o.textContent = p.name
    sel.append(o)
  }
  for (const p of list) {
    const li = document.createElement('li')
    li.className = 'post-item'
    const info = document.createElement('div')
    info.className = 'post-info'
    const t = document.createElement('div')
    t.className = 'post-title'
    t.textContent = `${p.name}${p.parentId ? '（子时期）' : ''}`
    const m = document.createElement('div')
    m.className = 'post-meta'
    m.textContent = `${p.start} → ${p.end || '至今'}` + (p.summary ? ` · ${p.summary}` : '')
    info.append(t, m)
    const del = document.createElement('button')
    del.className = 'btn-del'
    del.textContent = '删除'
    del.onclick = async () => {
      if (!confirm(`删除时期「${p.name}」？`)) return
      await api(`/api/periods?id=${p.id}`, { method: 'DELETE' })
      await loadPeriods()
      await refreshStatus()
    }
    li.append(info, del)
    ul.append(li)
  }
}

async function loadNodes() {
  const list = await api('/api/nodes')
  $('nodeCount').textContent = `（${list.length} 个）`
  const ul = $('nodeList')
  ul.innerHTML = ''
  for (const n of list) {
    const li = document.createElement('li')
    li.className = 'post-item'
    const info = document.createElement('div')
    info.className = 'post-info'
    const t = document.createElement('div')
    t.className = 'post-title'
    t.textContent = n.title
    const m = document.createElement('div')
    m.className = 'post-meta'
    m.textContent = `${n.date}` + (n.location ? ` · ${n.location}` : '') + (n.desc ? ` · ${n.desc}` : '')
    info.append(t, m)
    const del = document.createElement('button')
    del.className = 'btn-del'
    del.textContent = '删除'
    del.onclick = async () => {
      if (!confirm(`删除节点「${n.title}」？`)) return
      await api(`/api/nodes?id=${n.id}`, { method: 'DELETE' })
      await loadNodes()
      await refreshStatus()
    }
    li.append(info, del)
    ul.append(li)
  }
}

$('periodForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  try {
    const body = {
      name: $('pName').value.trim(),
      start: $('pStart').value,
      end: $('pEnd').value,
      summary: $('pSummary').value.trim(),
    }
    if ($('pParent').value) body.parentId = $('pParent').value
    await api('/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    $('pName').value = ''; $('pStart').value = ''; $('pEnd').value = ''; $('pSummary').value = ''
    await loadPeriods()
    await refreshStatus()
  } catch (err) { alert('添加失败：' + err.message) }
})

$('nodeForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  try {
    await api('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: $('nDate').value,
        title: $('nTitle').value.trim(),
        location: $('nLoc').value.trim(),
        desc: $('nDesc').value.trim(),
      }),
    })
    $('nDate').value = ''; $('nTitle').value = ''; $('nLoc').value = ''; $('nDesc').value = ''
    await loadNodes()
    await refreshStatus()
  } catch (err) { alert('添加失败：' + err.message) }
})

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('publishBtn').disabled = true
  $('publishBtn').textContent = '发布中…'
  try {
    await api('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: $('sTitle').value.trim(),
        nickname: $('sNickname').value.trim(),
        currentStatus: $('sStatus').value.trim(),
        attrs: textToAttrs($('sAttrs').value),
        avatar: $('sAvatar').value.trim(),
        birthday: $('sBirthday').value,
        timeWindowMonths: Number($('sWindow').value),
        theme: $('sTheme').value,
      }),
    })
    const r = await api('/api/push', { method: 'POST' })
    $('siteName').textContent = $('sTitle').value.trim() || '管理面板'
    alert('已保存并发布' + (r.commit ? `：${r.commit}` : '（无改动）'))
    await refreshStatus()
  } catch (err) {
    alert('发布失败：' + err.message)
  } finally {
    $('publishBtn').disabled = false
    $('publishBtn').textContent = '保存并发布'
  }
})

loadSettings().catch((e) => alert('加载设置失败：' + e.message))
loadPeriods().catch((e) => alert('加载时期失败：' + e.message))
loadNodes().catch((e) => alert('加载节点失败：' + e.message))
refreshStatus()
