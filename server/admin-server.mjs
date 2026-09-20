// 本地面板服务器：提供面板页面 + 写内容 / 改设置 / 保存并发布的 API
// 只监听 127.0.0.1，仅本机可访问
import { createServer } from 'node:http'
import { readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CONTENT = path.join(ROOT, 'public', 'content')
const POSTS = path.join(CONTENT, 'posts')
const SETTINGS = path.join(CONTENT, 'settings.json')
const ADMIN = path.join(__dirname, '..', 'admin')
const PORT = Number(process.env.PORT || 5174)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      chunks.push(c)
      size += c.length
      if (size > 2e6) { reject(new Error('内容过大')); req.destroy() }
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) { reject(e) }
    })
  })
}

async function buildPostMarkdown(p) {
  const tags = Array.isArray(p.tags)
    ? p.tags
    : String(p.tags || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  const lines = [
    '---',
    `title: ${String(p.title || '未命名').replace(/[\r\n]/g, ' ').trim()}`,
    `date: ${p.date || new Date().toISOString().slice(0, 10)}`,
    `type: ${p.type || 'diary'}`,
    `visible: ${p.visible || 'private'}`,
  ]
  if (tags.length) lines.push(`tags: [${tags.join(', ')}]`)
  lines.push('---', '', String(p.body || ''))
  return lines.join('\n') + '\n'
}

function parsePostMeta(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!m) return { title: '未命名', date: '', type: 'diary', visible: 'private', tags: [], body: text }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) {
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if (v.startsWith('[')) v = v.slice(1, -1).split(',').map((s) => s.trim())
      meta[k] = v
    }
  }
  return { ...meta, body: (m[2] || '').trim() }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    const p = url.pathname

    // ---------- API ----------
    if (p === '/api/settings' && req.method === 'GET') {
      return sendJSON(res, 200, JSON.parse(await readFile(SETTINGS, 'utf-8')))
    }
    if (p === '/api/settings' && req.method === 'POST') {
      const body = await readBody(req)
      // 合并而非覆盖：保留 siteCreated 等面板里没有的字段
      const existing = JSON.parse(await readFile(SETTINGS, 'utf-8'))
      const merged = { ...existing, ...body }
      const out = JSON.stringify(merged, null, 2) + '\n'
      JSON.parse(out) // 写前校验：非法内容不落盘
      await writeFile(SETTINGS, out, 'utf-8')
      return sendJSON(res, 200, { ok: true })
    }
    if (p === '/api/posts' && req.method === 'GET') {
      const files = (await readdir(POSTS)).filter((f) => f.endsWith('.md')).sort()
      const posts = []
      for (const f of files) {
        posts.push({ name: f, ...parsePostMeta(await readFile(path.join(POSTS, f), 'utf-8')) })
      }
      return sendJSON(res, 200, posts)
    }
    if (p === '/api/posts' && req.method === 'POST') {
      const body = await readBody(req)
      const n = String((await readdir(POSTS)).filter((f) => f.endsWith('.md')).length + 1).padStart(4, '0')
      const name = `${body.date || new Date().toISOString().slice(0, 10)}-${n}.md`
      await writeFile(path.join(POSTS, name), await buildPostMarkdown(body), 'utf-8')
      return sendJSON(res, 200, { ok: true, name })
    }
    if (p === '/api/posts' && req.method === 'DELETE') {
      const name = url.searchParams.get('name')
      if (!name || !/^[\w.-]+\.md$/.test(name)) return sendJSON(res, 400, { ok: false, error: '文件名不合法' })
      await rm(path.join(POSTS, name))
      return sendJSON(res, 200, { ok: true })
    }
    if (p === '/api/status' && req.method === 'GET') {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT })
      const changes = stdout.trim().split('\n').filter(Boolean)
      return sendJSON(res, 200, { dirty: changes.length > 0, changes })
    }
    if (p === '/api/push' && req.method === 'POST') {
      await execFileAsync('git', ['add', '-A'], { cwd: ROOT })
      let commit = ''
      try {
        commit = (await execFileAsync('git', ['commit', '-m', 'admin: 保存内容'], { cwd: ROOT })).stdout.trim()
      } catch (e) {
        commit = (e.stderr || e.stdout || '').trim()
      }
      const push = (await execFileAsync('git', ['push'], { cwd: ROOT })).stdout.trim()
      return sendJSON(res, 200, { ok: true, commit: commit.split('\n').pop(), push: push.split('\n').pop() })
    }

    // ---------- 面板静态文件 ----------
    let file = p === '/' ? '/index.html' : p
    file = decodeURIComponent(file)
    const full = path.normalize(path.join(ADMIN, file))
    if (!full.startsWith(ADMIN)) return sendJSON(res, 403, { ok: false })
    const data = await readFile(full)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' })
    res.end(data)
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: String((e && e.message) || e) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`管理面板已启动: http://127.0.0.1:${PORT}`)
})
