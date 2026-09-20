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
refreshStatus()
