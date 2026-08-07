import { Context } from 'hono'
import { getProviders, getProxyKeys, getLogs, getDebugMode } from './storage'
import { SITE_CONFIG, OPENCODE_DEFAULT_URL } from './config'
import type { Env } from './types'
import { CSS_CONTENT } from './pages.css'
import { SHARED_JS, renderSiteFooter } from './shared.js'
import { ensureTierStorage } from './tiers'

// 前端页面模板：仅重构视觉与交互，保持后端路由、KV 结构和 API 契约不变。
const escapePageHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const H = (title: string) => `
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="oklch(98.5% 0.004 250)">
  <title>${title} — ${SITE_CONFIG.title}</title>
  <link rel="icon" href="${SITE_CONFIG.favicon}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500;600&amp;family=Space+Grotesk:wght@500;600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${SITE_CONFIG.faCdn}">
  <style>${CSS_CONTENT}</style>
</head>`

// ===== 首页 =====

export async function renderHomePage(c: Context<{ Bindings: Env }>, isLoggedIn: boolean) {
  const providers = await getProviders(c.env)
  const tierData = await ensureTierStorage(c.env)
  const tier1Models = tierData.tier1 || []
  const tier2Count = (tierData.tier2 || []).length

  const host = c.req.header('host') || 'localhost:8787'
  const apiBase = `https://${host}/v1`
  const enabledProviders = providers.filter((provider) => provider.enabled)
  const allModelsCount = providers.reduce((total, provider) => total + provider.models.length, 0)
  const enabledModelsCount = enabledProviders.reduce((total, provider) => total + provider.models.filter((model) => model.enabled).length, 0)

  return c.html(`<!DOCTYPE html><html lang="zh-CN">
${H('首页')}
<body class="site-page home-page">
<header class="topbar">
  <div class="shell topbar__inner">
    <a class="brand" href="/" aria-label="AI Gateway 首页">
      <span class="brand__mark" aria-hidden="true"><i class="fas fa-cloud"></i></span>
      <span class="brand__name">${SITE_CONFIG.title}</span>
      <span class="brand__descriptor">API CONTROL PLANE</span>
    </a>
    <nav class="topbar__actions" id="topbar-actions" aria-label="主导航">
      ${isLoggedIn
        ? `<a href="/admin" class="btn btn-p"><i class="fas fa-sliders-h" aria-hidden="true"></i>管理控制台</a><a href="/admin/logout" class="btn btn-gh" onclick="localStorage.removeItem('admin_token')"><i class="fas fa-sign-out-alt" aria-hidden="true"></i>退出</a>`
        : `<a href="/admin/login" class="btn btn-p"><i class="fas fa-sign-in-alt" aria-hidden="true"></i>管理员登录</a>`
      }
    </nav>
  </div>
</header>

<main>
  <section class="shell home-hero" aria-labelledby="home-title">
    <div class="home-hero__copy">
      <p class="eyebrow"><span aria-hidden="true"></span>UNIFIED AI GATEWAY</p>
      <h1 id="home-title">一个 API，调用已配置的所有模型。</h1>
      <p class="home-hero__lede">统一的 OpenAI / Anthropic 兼容入口。模型按提供商归档，转发 Key、启用状态和故障转移集中管理。</p>
      <div class="endpoint-box" aria-label="API 接入地址">
        <span class="endpoint-box__label">BASE URL</span>
        <code>${escapePageHtml(apiBase)}</code>
        <button class="icon-btn copy-control" type="button" data-copy="${escapePageHtml(apiBase)}" aria-label="复制 API 地址">
          <i class="far fa-copy" aria-hidden="true"></i><span>复制</span>
        </button>
      </div>
      <p id="copy-status" class="sr-status" aria-live="polite"></p>
    </div>

    <figure class="request-panel" aria-labelledby="request-caption">
      <figcaption id="request-caption">
        <span>POST /chat/completions</span>
        <span class="protocol-state"><i aria-hidden="true"></i>OPENAI COMPATIBLE</span>
      </figcaption>
      <pre><code><span class="syntax-command">curl</span> ${escapePageHtml(apiBase)}/chat/completions \\
  <span class="syntax-key">-H</span> <span class="syntax-string">"Authorization: Bearer sk_cf_••••"</span> \\
  <span class="syntax-key">-H</span> <span class="syntax-string">"Content-Type: application/json"</span> \\
  <span class="syntax-key">-d</span> <span class="syntax-string">'{
    "model": "opencode/deepseek-v4-flash-free",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'</span></code></pre>
      <div class="request-panel__foot">
        <span>模型格式</span>
        <code>provider/model</code>
      </div>
    </figure>
  </section>

  <section class="shell metrics-strip" aria-label="网关配置概览">
    <div class="metric"><span class="metric__value">${providers.length}</span><span class="metric__label">提供商总计</span></div>
    <div class="metric"><span class="metric__value">${enabledProviders.length}</span><span class="metric__label">已启用提供商</span></div>
    <div class="metric"><span class="metric__value">${allModelsCount}</span><span class="metric__label">模型总计</span></div>
    <div class="metric"><span class="metric__value">${enabledModelsCount}</span><span class="metric__label">可用模型</span></div>
    <div class="metric"><span class="metric__value">${tier1Models.length} / 9</span><span class="metric__label">第一梯队席位</span></div>
  </section>

  <section class="shell tier1-showcase" style="margin-top:2rem;margin-bottom:2rem;">
    <div class="section-heading" style="margin-bottom:1rem;">
      <div>
        <h2 style="font-size:1.35rem;font-weight:600;display:flex;align-items:center;gap:0.5rem;margin:0;">
          <i class="fas fa-layer-group" style="color:#2563eb;"></i>
          第一梯队 (Tier 1) 黄金模型池
          <span style="font-size:0.75rem;padding:0.2rem 0.5rem;background:#dbeafe;color:#1e40af;border-radius:9999px;font-weight:600;">9 席位固定</span>
        </h2>
        <p style="color:#64748b;margin-top:0.25rem;font-size:0.875rem;margin-bottom:0;">
          <code>auto/auto</code> 智能路由仅在第一梯队内匹配选优；当模型遭遇业务故障或连续失败时自动淘汰，并使用独立轻量探测从第二梯队候选池（含 ${tier2Count} 个候选模型）海选补位。
        </p>
      </div>
    </div>

    <!-- Auto 调用示例卡片 -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1rem;margin-bottom:1.25rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
        <span style="font-weight:600;font-size:0.9rem;display:flex;align-items:center;gap:0.5rem;color:#0f172a;">
          <i class="fas fa-bolt" style="color:#eab308;"></i> 极简 Auto 智能路由：指定 model: "auto/auto" 或 "auto"
        </span>
        <span style="font-size:0.75rem;color:#64748b;">支持动态淘汰与独立轻量海选补位</span>
      </div>
      <pre style="background:#0f172a;color:#f8fafc;padding:0.75rem 1rem;border-radius:0.5rem;overflow-x:auto;font-size:0.825rem;margin:0;line-height:1.5;"><code>curl ${escapePageHtml(apiBase)}/chat/completions \\
  -H "Authorization: Bearer sk_cf_••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto/auto",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'</code></pre>
    </div>

    <!-- 第一梯队 9 个席位卡片 -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:0.875rem;">
      ${Array.from({ length: 9 }).map((_, idx) => {
        const item = tier1Models[idx]
        if (item) {
          const probeStat = tierData.probeStats[item.fullId]
          const bStat = tierData.businessStats[item.fullId]
          const probeLatText = probeStat?.success ? `${probeStat.latency} ms` : '初始化海选'
          const busLatText = bStat && bStat.totalRequests > 0 ? `${bStat.avgLatency} ms (${bStat.totalRequests}次)` : '尚无真实业务'
          return `
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:0.625rem;padding:0.875rem;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.375rem;">
              <span style="font-size:0.7rem;font-weight:700;color:#1e40af;background:#dbeafe;padding:0.15rem 0.4rem;border-radius:0.25rem;">
                席位 #${idx + 1}
              </span>
              <span style="font-size:0.7rem;color:#15803d;font-weight:600;display:flex;align-items:center;gap:0.25rem;">
                <i class="fas fa-check-circle" style="font-size:0.65rem;"></i> 第一梯队
              </span>
            </div>
            <div style="font-weight:600;font-size:0.9rem;color:#0f172a;word-break:break-all;margin-bottom:0.5rem;font-family:monospace;">
              ${escapePageHtml(item.fullId)}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.375rem;font-size:0.75rem;background:#f8fafc;padding:0.375rem 0.5rem;border-radius:0.375rem;">
              <div>
                <div style="color:#64748b;font-size:0.65rem;">海选探测延迟</div>
                <div style="font-weight:600;color:#0369a1;">${probeLatText}</div>
              </div>
              <div>
                <div style="color:#64748b;font-size:0.65rem;">用户业务延迟</div>
                <div style="font-weight:600;color:#059669;">${busLatText}</div>
              </div>
            </div>
          </div>`
        } else {
          return `
          <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:0.625rem;padding:0.875rem;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:90px;">
            <span style="font-size:0.7rem;font-weight:600;color:#94a3b8;margin-bottom:0.2rem;">席位 #${idx + 1}</span>
            <span style="font-size:0.8rem;color:#64748b;display:flex;align-items:center;gap:0.375rem;">
              <i class="fas fa-clock" style="color:#94a3b8;"></i> 待选拔补位
            </span>
          </div>`
        }
      }).join('')}
    </div>
  </section>

  <section class="shell directory" aria-labelledby="directory-title">
    <div class="section-heading">
      <div>
        <h2 id="directory-title">模型列表</h2>
        <p>点击模型 ID 即可复制；这里只展示已启用的提供商与模型。</p>
      </div>
      <label class="search-field" for="model-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <span class="sr-only">搜索提供商或模型</span>
        <input id="model-search" type="search" placeholder="搜索提供商或模型" autocomplete="off">
      </label>
    </div>

    <div class="provider-index" id="provider-index">
      ${enabledProviders.length ? enabledProviders.map((provider) => {
        const models = provider.models.filter((model) => model.enabled)
        return `<article class="provider-row" data-search="${escapePageHtml(`${provider.name} ${provider.id} ${models.map((model) => model.id).join(' ')}`.toLowerCase())}">
          <div class="provider-row__identity">
            <span class="provider-row__mark" aria-hidden="true">${escapePageHtml(provider.name.charAt(0).toUpperCase() || 'A')}</span>
            <div>
              <h3>${escapePageHtml(provider.name)}</h3>
              <p><code>${escapePageHtml(provider.id)}</code><span>${(provider.apiType || 'openai') === 'anthropic' ? 'Anthropic' : 'OpenAI'} 兼容</span></p>
            </div>
          </div>
          <div class="provider-row__models">
            ${models.length ? models.map((model) => {
              const fullModel = `${provider.id}/${model.id}`
              const isPermDisabled = !!model.permanentlyDisabled
              const isCooldown = typeof model.cooldownUntil === 'number' && Date.now() < model.cooldownUntil
              const cooldownSec = isCooldown && typeof model.cooldownUntil === 'number' ? Math.ceil((model.cooldownUntil - Date.now()) / 1000) : 0

              let statusHtml = ''
              if (isPermDisabled) {
                statusHtml = `<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;padding:1px 4px;border-radius:3px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;margin-left:4px;" title="${escapePageHtml(model.disabledReason || '受上游故障影响永久失效')}"><i class="fas fa-ban" style="font-size:9px;"></i>失效</span>`
              } else if (isCooldown) {
                statusHtml = `<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;padding:1px 4px;border-radius:3px;background:#fefce8;color:#ca8a04;border:1px solid #fef08a;margin-left:4px;"><i class="fas fa-hourglass-half" style="font-size:9px;"></i>冷却(${cooldownSec}s)</span>`
              } else {
                statusHtml = `<span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;padding:1px 4px;border-radius:3px;background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;margin-left:4px;"><i class="fas fa-check-circle" style="font-size:9px;"></i>正常</span>`
              }

              return `<button class="model-token copy-control" type="button" data-copy="${escapePageHtml(fullModel)}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;min-height:auto;"><code>${escapePageHtml(fullModel)}</code>${statusHtml}<i class="far fa-copy" aria-hidden="true" style="margin-left:4px;"></i></button>`
            }).join('') : '<span class="empty-inline">暂无启用模型</span>'}
          </div>
          <span class="status-badge status-badge--on"><i aria-hidden="true"></i>已启用</span>
        </article>`
      }).join('') : `<div class="empty-state"><i class="fas fa-cubes" aria-hidden="true"></i><h3>尚无可用模型</h3><p>管理员启用提供商和模型后，它们会出现在这里。</p>${isLoggedIn ? '<a class="btn btn-p" href="/admin">前往管理控制台</a>' : ''}</div>`}
    </div>
    <div id="search-empty" class="empty-state hd"><i class="fas fa-search" aria-hidden="true"></i><h3>没有匹配结果</h3><p>请尝试输入提供商名称、ID 或模型名称。</p></div>
  </section>
</main>

${renderSiteFooter(SITE_CONFIG.title)}

<script>
(function () {
  // 自动从 localStorage 恢复会话 Cookie 并同步导航按钮状态，防止 iframe 跨域 Cookie 丢失导致登录失效
  var savedToken = localStorage.getItem('admin_token');
  if (savedToken) {
    if (!document.cookie.includes('session_id=')) {
      document.cookie = "session_id=" + savedToken + "; path=/; max-age=86400; SameSite=None; Secure";
    }
    var nav = document.getElementById('topbar-actions');
    if (nav && !nav.innerHTML.includes('admin')) {
      nav.innerHTML = '<a href="/admin" class="btn btn-p"><i class="fas fa-sliders-h" aria-hidden="true"></i>管理控制台</a>' +
                      '<a href="/admin/logout" class="btn btn-gh" onclick="localStorage.removeItem(&quot;admin_token&quot;)"><i class="fas fa-sign-out-alt" aria-hidden="true"></i>退出</a>';
    }
  }

  var status = document.getElementById('copy-status')
  document.querySelectorAll('.copy-control').forEach(function (button) {
    button.addEventListener('click', async function () {
      var text = button.getAttribute('data-copy') || ''
      var icon = button.querySelector('i')
      var label = button.querySelector('span')
      try {
        await navigator.clipboard.writeText(text)
        button.setAttribute('data-state', 'success')
        if (icon) icon.className = 'fas fa-check c-s'
        if (label) label.textContent = '已复制'
        if (status) status.textContent = '已复制 ' + text
        window.setTimeout(function () {
          button.removeAttribute('data-state')
          if (icon) icon.className = 'far fa-copy'
          if (label) label.textContent = '复制'
        }, 1800)
      } catch (error) {
        button.setAttribute('data-state', 'error')
        if (status) status.textContent = '复制失败，请手动选择文本。'
      }
    })
  })

  var search = document.getElementById('model-search')
  var rows = Array.from(document.querySelectorAll('.provider-row'))
  var empty = document.getElementById('search-empty')
  if (search) search.addEventListener('input', function () {
    var query = search.value.trim().toLowerCase()
    var visible = 0
    rows.forEach(function (row) {
      var matched = !query || (row.getAttribute('data-search') || '').includes(query)
      row.classList.toggle('hd', !matched)
      if (matched) visible++
    })
    if (empty) empty.classList.toggle('hd', visible > 0 || !query)
  })
})()
</script>
</body></html>`)
}

// ===== 登录页 =====

export async function renderLoginPage(c: Context<{ Bindings: Env }>) {
  return c.html(`<!DOCTYPE html><html lang="zh-CN">
${H('登录')}
<body class="site-page auth-page">
<header class="topbar topbar--auth">
  <div class="shell topbar__inner">
    <a class="brand" href="/" aria-label="AI Gateway 首页">
      <span class="brand__mark" aria-hidden="true"><i class="fas fa-cloud"></i></span>
      <span class="brand__name">${SITE_CONFIG.title}</span>
    </a>
    <a href="/" class="btn btn-gh"><i class="fas fa-arrow-left" aria-hidden="true"></i>返回首页</a>
  </div>
</header>

<main class="auth-shell">
  <section class="auth-context" aria-labelledby="auth-context-title">
    <p class="eyebrow"><span aria-hidden="true"></span>CONTROL PLANE ACCESS</p>
    <h1 id="auth-context-title">管理提供商、模型和转发密钥。</h1>
  </section>

  <section class="auth-form-wrap" aria-labelledby="login-title">
    <form class="auth-form" id="login-form" novalidate>
      <div class="auth-form__heading">
        <span class="auth-form__icon" aria-hidden="true"><i class="fas fa-lock"></i></span>
        <div><h2 id="login-title">管理员登录</h2><p>使用部署时配置的账号继续。</p></div>
      </div>

      <div id="er" class="al al-e hd" role="alert" aria-live="assertive">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i><span id="em"></span>
      </div>

      <div class="fg">
        <label for="u">用户名</label>
        <div class="input-wrap"><i class="far fa-user" aria-hidden="true"></i><input type="text" id="u" name="username" placeholder="admin" autocomplete="username" aria-required="true" aria-describedby="login-helper"></div>
      </div>
      <div class="fg">
        <label for="p">密码</label>
        <div class="input-wrap"><i class="fas fa-key" aria-hidden="true"></i><input type="password" id="p" name="password" placeholder="admin123" autocomplete="current-password" aria-required="true" aria-describedby="login-helper"><button class="password-toggle" id="password-toggle" type="button" aria-label="显示密码"><i class="far fa-eye" aria-hidden="true"></i></button></div>
      </div>
      <p id="login-helper" class="form-helper">默认账号：admin / admin123（或环境变量中配置的凭据）。</p>
      <button class="btn btn-p btn-submit" id="login-button" type="submit"><span class="button-label"><i class="fas fa-sign-in-alt" aria-hidden="true"></i>登录管理控制台</span><span class="button-loading"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>正在验证</span></button>
    </form>
  </section>
</main>

<script>
(function () {
  var form = document.getElementById('login-form')
  var username = document.getElementById('u')
  var password = document.getElementById('p')
  var errorBox = document.getElementById('er')
  var errorMessage = document.getElementById('em')
  var submit = document.getElementById('login-button')
  var toggle = document.getElementById('password-toggle')

  function showError(message) {
    errorMessage.textContent = message
    errorBox.classList.remove('hd')
    username.setAttribute('aria-invalid', 'true')
    password.setAttribute('aria-invalid', 'true')
  }
  function clearError() {
    errorBox.classList.add('hd')
    username.removeAttribute('aria-invalid')
    password.removeAttribute('aria-invalid')
  }

  toggle.addEventListener('click', function () {
    var show = password.type === 'password'
    password.type = show ? 'text' : 'password'
    toggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码')
    toggle.querySelector('i').className = show ? 'far fa-eye-slash' : 'far fa-eye'
    password.focus({ preventScroll: true })
  })

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    clearError()
    var u = username.value.trim()
    var p = password.value
    if (!u || !p) {
      showError('请填写用户名和密码后再登录。')
      ;(!u ? username : password).focus()
      return
    }
    submit.disabled = true
    submit.setAttribute('data-state', 'loading')
    try {
      var response = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      })
      var data = await response.json()
      if (data.success) {
        submit.setAttribute('data-state', 'success')
        if (data.token) {
          localStorage.setItem('admin_token', data.token)
          document.cookie = "session_id=" + data.token + "; path=/; max-age=86400; SameSite=None; Secure"
        }
        window.location.href = data.redirectUrl || ('/admin?token=' + (data.token || ''))
        return
      }
      showError(data.message || '登录失败，请检查账号配置。')
    } catch (error) {
      showError('无法连接服务，请检查网络后重试。')
    }
    submit.disabled = false
    submit.removeAttribute('data-state')
  })
})()
</script>
</body></html>`)
}

// ===== 管理后台 =====

export async function renderAdminPage(c: Context<{ Bindings: Env }>) {
  const providers = await getProviders(c.env)
  const proxyKeys = await getProxyKeys(c.env)
  const logs = await getLogs(c.env)
  const isDebug = await getDebugMode(c.env)
  const enabledProvidersCount = providers.filter((provider) => provider.enabled).length
  const modelsCount = providers.reduce((total, provider) => total + provider.models.length, 0)
  const enabledModelsCount = providers.reduce((total, provider) => total + provider.models.filter((model) => model.enabled).length, 0)
  const enabledProxyKeysCount = proxyKeys.filter((key) => key.enabled).length

  return c.html(`<!DOCTYPE html><html lang="zh-CN">
${H('管理')}
<body class="site-page admin-page">
<div class="admin-shell">
  <aside class="admin-rail" aria-label="控制台导航">
    <a class="brand admin-rail__brand" href="/">
      <span class="brand__mark" aria-hidden="true"><i class="fas fa-cloud"></i></span>
      <span><strong>${SITE_CONFIG.title}</strong><small>CONTROL PLANE</small></span>
    </a>
    <nav class="admin-nav">
      <a class="admin-nav__link is-active" href="#overview"><i class="fas fa-chart-pie" aria-hidden="true"></i><span>概览</span></a>
      <a class="admin-nav__link" href="#providers"><i class="fas fa-server" aria-hidden="true"></i><span>提供商</span><b>${providers.length}</b></a>
      <a class="admin-nav__link" href="#proxy-keys"><i class="fas fa-key" aria-hidden="true"></i><span>转发 Key</span><b>${proxyKeys.length}</b></a>
      <a class="admin-nav__link" href="#logs"><i class="fas fa-list-alt" aria-hidden="true"></i><span>请求日志</span><b id="logs-count-badge">${logs.length}</b></a>
    </nav>
    <div class="admin-rail__foot">
      <a href="/" class="admin-nav__link"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>返回首页</span></a>
      <a href="/admin/logout" class="admin-nav__link" onclick="localStorage.removeItem('admin_token')"><i class="fas fa-sign-out-alt" aria-hidden="true"></i><span>退出登录</span></a>
    </div>
  </aside>

  <div class="admin-main">
    <header class="admin-topbar">
      <a class="brand" href="/"><span class="brand__mark" aria-hidden="true"><i class="fas fa-cloud"></i></span><span class="brand__name">${SITE_CONFIG.title}</span></a>
      <nav aria-label="移动端控制台导航"><a href="#overview">概览</a><a href="#providers">提供商</a><a href="#proxy-keys">Key</a><a href="#logs">日志</a></nav>
      <a class="icon-btn" href="/admin/logout" onclick="localStorage.removeItem('admin_token')" aria-label="退出登录"><i class="fas fa-sign-out-alt" aria-hidden="true"></i></a>
    </header>

    <main class="admin-content">
      <div id="toast" class="hd toast" role="status" aria-live="polite"></div>

      <!-- 顶部固定悬浮【统一保存】大按钮栏 -->
      <div class="save-floating-bar" id="save-bar">
        <div class="save-status-group">
          <span id="save-status-badge" class="badge-status badge-synced">
            <i class="fas fa-check-circle" aria-hidden="true"></i> 配置已同步 KV
          </span>
          <span id="save-status-text" style="color: var(--color-muted); font-size: var(--text-xs);">所有改动均在内存暂存，点击右侧【统一保存】批量落盘。</span>
        </div>
        <button id="btn-save-all" class="btn-save-all" onclick="saveAllConfig()">
          <i class="fas fa-save" aria-hidden="true"></i> 统一保存
        </button>
      </div>

      <section id="overview" class="admin-overview" aria-labelledby="admin-title">
        <div class="admin-heading">
          <div><p class="eyebrow"><span aria-hidden="true"></span>GATEWAY STATUS</p><h1 id="admin-title">管理控制台</h1><p>配置提供商、模型与客户端访问凭据。变更将写入 Cloudflare KV。</p></div>
          <div class="admin-heading__actions">
            <button id="btn-probe" class="btn btn-s" onclick="triggerProbe()"><i class="fas fa-radar" aria-hidden="true"></i>触发探测任务</button>
            <button class="btn btn-s" onclick="resetCooldowns()"><i class="fas fa-undo" aria-hidden="true"></i>一键重置冷却模型</button>
            <a href="/" class="btn btn-s"><i class="fas fa-external-link-alt" aria-hidden="true"></i>查看模型列表</a>
          </div>
        </div>
        <div class="admin-metrics" aria-label="配置统计">
          <div><span>${providers.length}</span><p>提供商</p><small>${enabledProvidersCount} 个已启用</small></div>
          <div><span>${modelsCount}</span><p>模型</p><small>${enabledModelsCount} 个可用</small></div>
          <div><span>${proxyKeys.length}</span><p>转发 Key</p><small>${enabledProxyKeysCount} 个可用</small></div>
          <div><span class="status-dot status-dot--online"><i aria-hidden="true"></i>已配置</span><p>存储</p><small>Cloudflare KV</small></div>
        </div>
      </section>

      <section id="providers" class="workspace-section" aria-labelledby="providers-title">
        <div class="section-heading section-heading--admin">
          <div><h2 id="providers-title">提供商</h2><p>管理上游地址、协议、API Key 和模型。</p></div>
          <button class="btn btn-p" onclick="showAdd()"><i class="fas fa-plus" aria-hidden="true"></i>添加提供商</button>
        </div>

        <div class="af-w">
          <div id="af" class="hd add-form-panel">
            <div class="panel-heading"><div><span class="panel-heading__mark"><i class="fas fa-plus" aria-hidden="true"></i></span><div><h3>添加新提供商</h3><p>先配置基本信息，再测试 Key 与模型连接。</p></div></div><button class="icon-btn" type="button" onclick="hideAdd()" aria-label="关闭添加表单"><i class="fas fa-times" aria-hidden="true"></i></button></div>
            <div class="fr">
              <div class="fg"><label for="anm">名称</label><input type="text" id="anm" placeholder="DeepSeek"></div>
              <div class="fg"><label for="aid">提供商 ID</label><input type="text" id="aid" placeholder="deepseek"><span class="form-helper">用于模型前缀，创建后不可修改。</span></div>
            </div>
            <div class="fg"><label for="aurl">API 地址</label><input type="url" id="aurl" placeholder="https://api.deepseek.com"></div>
            <div class="fg"><label for="afmt">API 格式</label><select id="afmt" class="select-sm"><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 兼容</option></select></div>
            <fieldset class="form-group"><legend>上游 API Keys</legend><div id="akeys"><div class="fc mb-4 field-row"><input type="text" placeholder="sk-xxx" class="fx1 aki" aria-label="上游 API Key"><label class="tg" title="启用 Key"><input type="checkbox" checked class="ake" aria-label="启用 Key"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button><button class="icon-btn" onclick="testNewAKey(this)" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug" aria-hidden="true"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times" aria-hidden="true"></i></button></div></div><button class="btn btn-s btn-xs" onclick="addAKeyRow()"><i class="fas fa-plus" aria-hidden="true"></i>添加 Key</button></fieldset>
            <aside id="amc" class="hd mdl-list-panel"><div class="panel-heading"><div><span class="panel-heading__mark"><i class="fas fa-cube" aria-hidden="true"></i></span><div><h3>可用模型</h3><p>点击“+”单条添加，或使用一键导入。</p></div></div><div class="fc" style="gap:var(--space-2xs);"><button class="btn btn-s btn-xs" onclick="importAllNewModels()" style="margin-right:8px;"><i class="fas fa-file-import" aria-hidden="true"></i> 一键导入</button><button class="icon-btn" type="button" onclick="hideMdlPanel('amc')" title="关闭可用模型" aria-label="关闭可用模型"><i class="fas fa-times" aria-hidden="true"></i></button></div></div><div id="amcl"></div></aside>
            <fieldset class="form-group"><legend>模型 ID</legend><div id="amodels"><div class="fc mb-4 field-row"><input type="text" placeholder="deepseek-chat" class="fx1 ami" aria-label="模型 ID"><label class="tg" title="启用模型"><input type="checkbox" checked class="ame" aria-label="启用模型"><span class="sl"></span></label><button class="icon-btn" onclick="testNewMdl(this)" title="测试模型" aria-label="测试模型"><i class="fas fa-plug" aria-hidden="true"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除模型" aria-label="移除模型"><i class="fas fa-times" aria-hidden="true"></i></button></div></div><div class="fc mt-1 field-row"><button class="btn btn-s btn-xs" onclick="addMdlRow()"><i class="fas fa-plus" aria-hidden="true"></i>添加模型</button><button class="btn btn-s btn-xs btn-d" onclick="clearAllNewModels()" style="margin-left:8px;"><i class="fas fa-trash" aria-hidden="true"></i>一键删除所有模型</button></div></fieldset>
            <div class="panel-actions"><label class="switch-label"><span>创建后立即启用</span><span class="tg"><input type="checkbox" checked id="aen"><span class="sl"></span></span></label><div><button class="btn btn-s" onclick="hideAdd()">取消</button><button class="btn btn-p" onclick="createProv()"><i class="fas fa-plus" aria-hidden="true"></i>暂存并添加</button></div></div>
            <div id="atestR" class="mt-1" aria-live="polite"></div>
          </div>
        </div>

        <div class="gp provider-list" id="plist">
          ${providers.length ? providers.map(p=>{
            let pStatusClass = '';
            if (!p.models || p.models.length === 0) {
              pStatusClass = 'pi-red';
            } else {
              const allDisabled = p.models.every((m: any) => m.enabled === false || m.permanentlyDisabled);
              if (allDisabled) {
                pStatusClass = 'pi-red';
              } else {
                const hasAbnormal = p.models.some((m: any) => m.enabled === false || m.permanentlyDisabled || (m.cooldownUntil && Date.now() < m.cooldownUntil));
                if (hasAbnormal) {
                  pStatusClass = 'pi-yellow';
                }
              }
            }
            return `
          <article class="pi ${pStatusClass}" data-id="${escapePageHtml(p.id)}">
            <div class="ps" onclick="tog('${p.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tog('${p.id}')}" aria-controls="dt-${escapePageHtml(p.id)}">
              <div class="l"><i class="fas fa-chevron-right provider-chevron" aria-hidden="true" id="ch-${escapePageHtml(p.id)}"></i><span class="provider-avatar" aria-hidden="true">${escapePageHtml(p.name.charAt(0).toUpperCase() || 'A')}</span><div><h3>${escapePageHtml(p.name)}</h3><div class="pu"><code>${escapePageHtml(p.id)}</code><span>${(p.apiType||'openai')==='anthropic'?'Anthropic':'OpenAI'}</span><span>${p.apiKeys.length} Keys</span><span>${p.models.length} 模型</span></div></div></div>
              <div class="fc fx-s0" onclick="event.stopPropagation()"><label class="tg"><input type="checkbox" ${p.enabled?'checked':''} id="en-${escapePageHtml(p.id)}" onchange="togglePb('${p.id}',this.checked)" aria-label="启用 ${escapePageHtml(p.name)}"><span class="sl"></span></label><span class="bd ${p.enabled?'bd-on':'bd-off'}">${p.enabled?'已启用':'未启用'}</span></div>
            </div>
            <div class="pd" id="dt-${escapePageHtml(p.id)}">
              <div class="detail-heading"><div><h3>编辑 ${escapePageHtml(p.name)}</h3><p>修改暂存在内存中，点击顶部【统一保存】落盘写入 KV。</p></div><span class="protocol-chip">${(p.apiType||'openai')==='anthropic'?'ANTHROPIC':'OPENAI'}</span></div>
              <div class="fr"><div class="fg"><label>名称</label><input type="text" id="nm-${escapePageHtml(p.id)}" value="${escapePageHtml(p.name)}"></div><div class="fg"><label>ID</label><input type="text" value="${escapePageHtml(p.id)}" disabled></div></div>
              <div class="fg"><label>API 地址</label><input type="url" id="url-${escapePageHtml(p.id)}" value="${escapePageHtml(p.baseUrl)}"></div>
              <div class="fg"><label>API 格式</label><select id="at-${escapePageHtml(p.id)}" class="select-sm"><option value="openai" ${(p.apiType||'openai')==='openai'?'selected':''}>OpenAI 兼容</option><option value="anthropic" ${p.apiType==='anthropic'?'selected':''}>Anthropic 兼容</option></select></div>
              <fieldset class="form-group"><legend>上游 API Keys</legend><div id="keys-${escapePageHtml(p.id)}">${p.apiKeys.map((k, ki)=>`<div class="fc mb-3 field-row" data-kidx="${ki}"><input type="text" value="${escapePageHtml(k.key)}" class="fx1" id="k-${escapePageHtml(p.id)}-${ki}" placeholder="API Key" aria-label="API Key"><label class="tg"><input type="checkbox" ${k.enabled?'checked':''} id="ken-${escapePageHtml(p.id)}-${ki}" aria-label="启用 Key"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button><button class="icon-btn" onclick="testKeyRow('${p.id}',${ki})" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug" aria-hidden="true"></i></button><button class="icon-btn" onclick="rmKeyRow('${p.id}',${ki})" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times" aria-hidden="true"></i></button></div>`).join('')}</div><div class="fc mt-1 field-row"><input type="text" id="nk-${escapePageHtml(p.id)}" placeholder="新的 API Key" class="fx1"><button class="btn btn-s btn-xs" onclick="addKeyRow('${p.id}')"><i class="fas fa-plus" aria-hidden="true"></i>添加</button></div></fieldset>
              <fieldset class="form-group"><legend>模型</legend><div id="ml-${escapePageHtml(p.id)}">${p.models.map((m,mi)=>{
                const isFailed = !!m.permanentlyDisabled;
                const styleAttr = isFailed ? 'style="color: #ef4444; border-color: #fca5a5; font-weight: 600; background-color: #fef2f2;"' : '';
                const titleText = isFailed ? `永久失效: ${escapePageHtml(m.disabledReason || '余额不足，等待管理员处理')}` : '模型 ID';
                const badgeHtml = isFailed ? `<span style="background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; margin-right: 8px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;" title="${titleText}"><i class="fas fa-exclamation-triangle"></i>永久失效</span>` : '';
                const unblockBtn = isFailed ? `<button class="icon-btn" onclick="unblockModel('${escapePageHtml(p.id)}','${escapePageHtml(m.id)}')" title="点击解封并恢复此模型" style="color: #ef4444; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; padding: 4px 8px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px; margin-right: 4px;"><i class="fas fa-unlock"></i>解封</button>` : '';
                return `<div class="fc mb-3 field-row" data-idx="${mi}">${badgeHtml}<input type="text" value="${escapePageHtml(m.id)}" class="fx1" id="mid-${escapePageHtml(p.id)}-${mi}" placeholder="模型 ID" ${styleAttr} title="${titleText}"><label class="tg"><input type="checkbox" ${m.enabled?'checked':''} id="men-${escapePageHtml(p.id)}-${mi}" aria-label="启用模型"><span class="sl"></span></label>${unblockBtn}<button class="icon-btn" onclick="testMdlBtn(this)" data-pid="${escapePageHtml(p.id)}" data-mid="${escapePageHtml(m.id)}" data-idx="${mi}" title="测试模型" aria-label="测试模型"><i class="fas fa-plug" aria-hidden="true"></i></button><button class="icon-btn" onclick="rmMdl('${p.id}',${mi})" title="移除模型" aria-label="移除模型"><i class="fas fa-times" aria-hidden="true"></i></button></div>`;
              }).join('')}</div><div class="fc mt-1 field-row"><input type="text" id="nmid-${escapePageHtml(p.id)}" placeholder="新的模型 ID" class="fx1"><button class="btn btn-s btn-xs" onclick="addMdl('${p.id}')"><i class="fas fa-plus" aria-hidden="true"></i>添加</button><button class="btn btn-s btn-xs btn-d" onclick="clearAllEditModels('${p.id}')" style="margin-left:8px;"><i class="fas fa-trash" aria-hidden="true"></i>一键删除模型</button></div></fieldset>
              <div class="detail-actions"><div id="tr-${escapePageHtml(p.id)}" aria-live="polite"></div><div>${p.models.some(m => m.permanentlyDisabled || (m.cooldownUntil && Date.now() < m.cooldownUntil)) ? `<button class="btn btn-s" onclick="resetAllModelsInProvider('${escapePageHtml(p.id)}')" style="margin-right:8px;"><i class="fas fa-undo-alt" aria-hidden="true"></i>重置异常模型</button>` : ''}${p.id === 'opencode' ? `<button class="btn btn-s" onclick="fetchEditModels('${escapePageHtml(p.id)}',this)"><i class="fas fa-download" aria-hidden="true"></i>获取模型</button>` : ''}<button class="btn btn-d" onclick="del('${p.id}')"><i class="fas fa-trash" aria-hidden="true"></i>删除</button><button class="btn btn-p" onclick="save('${p.id}')"><i class="fas fa-save" aria-hidden="true"></i>暂存更改</button></div></div>
            </div>
          </article>`
          }).join('') : `<div class="empty-state"><i class="fas fa-server" aria-hidden="true"></i><h3>还没有提供商</h3><p>添加第一个上游提供商，配置 API 地址、Key 和模型。</p><button class="btn btn-p" onclick="showAdd()">添加提供商</button></div>`}
        </div>
      </section>

      <section id="proxy-keys" class="workspace-section" aria-labelledby="proxy-keys-title">
        <div class="section-heading section-heading--admin"><div><h2 id="proxy-keys-title">转发 Key</h2><p>客户端使用这些 Key 访问统一的 <code>/v1</code> 接口。</p></div><button class="btn btn-p" onclick="genKey()"><i class="fas fa-plus" aria-hidden="true"></i>生成转发 Key</button></div>
        <div class="key-list">
          ${proxyKeys.length===0?'<div class="empty-state"><i class="fas fa-key" aria-hidden="true"></i><h3>暂无转发 Key</h3><p>生成一个 Key 后，客户端才能访问网关。</p><button class="btn btn-p" onclick="genKey()">生成转发 Key</button></div>':''}
          ${proxyKeys.map(k=>`<article class="ki" data-id="${escapePageHtml(k.id)}"><div class="key-main"><span class="key-icon" aria-hidden="true"><i class="fas fa-key"></i></span><div><div class="kv"><span id="kv-${escapePageHtml(k.id)}" data-full="${escapePageHtml(k.key)}" data-vis="0">${escapePageHtml(k.key.length>12?k.key.substring(0,8)+'*****'+k.key.substring(k.key.length-4):k.key)}</span><button class="icon-btn" onclick="toggleKeyVis('${k.id}')" title="显示或隐藏" aria-label="显示或隐藏 Key"><i class="far fa-eye" aria-hidden="true"></i></button><button class="icon-btn" onclick="copyText(this)" data-copy="${escapePageHtml(k.key)}" title="复制" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button></div><div class="key-meta"><h3>${escapePageHtml(k.name)}</h3><span class="key-meta__sep" aria-hidden="true">-</span><p>创建于 ${new Date(k.createdAt).toLocaleDateString()} · ${k.expiresAt?'有效至 '+new Date(k.expiresAt).toLocaleDateString():'永久有效'}</p></div></div></div><div class="key-actions"><label class="tg"><input type="checkbox" ${k.enabled?'checked':''} onchange="toggleProxyKey('${k.id}',this.checked)" aria-label="启用 ${escapePageHtml(k.name)}"><span class="sl"></span></label><span class="bd ${k.enabled?'bd-on':'bd-off'}">${k.enabled?'已启用':'已禁用'}</span><button class="bd bd-del" onclick="rmKey('${k.id}')"><i class="fas fa-trash" aria-hidden="true"></i>删除</button></div></article>`).join('')}
        </div>
      </section>

      <section id="logs" class="workspace-section" aria-labelledby="logs-title">
        <div class="section-heading section-heading--admin">
          <div><h2 id="logs-title">网关请求日志</h2><p>记录客户端 API 请求，包含耗时、HTTP 状态与失败原因。</p></div>
          <div class="fc" style="gap:12px;flex-wrap:wrap;">
            <label class="switch-label" style="background:var(--color-paper);padding:6px 12px;border-radius:var(--radius-control);border:1px solid var(--color-rule);" title="调试模式开启：每条日志实时写入 KV 并前端实时刷新">
              <span style="font-size:var(--text-xs);font-weight:600;">调试模式 (实时落盘)</span>
              <span class="tg"><input type="checkbox" id="debug-mode-toggle" ${isDebug ? 'checked' : ''} onchange="toggleDebugMode(this.checked)"><span class="sl"></span></span>
            </label>
            <button class="btn btn-s" onclick="fetchLogs()"><i class="fas fa-sync" aria-hidden="true"></i>刷新日志</button>
            <button class="btn btn-d" onclick="clearAllLogs()"><i class="fas fa-trash" aria-hidden="true"></i>清空日志</button>
          </div>
        </div>
        <div id="logs-panel" class="logs-container">
          <!-- 日志表格组件 -->
        </div>
      </section>
    </main>

    ${renderSiteFooter(SITE_CONFIG.title)}
  </div>
</div>

<div id="modal" class="modal-o hd" role="presentation" onclick="if(event.target===this)closeM()"><div class="modal" id="mc" role="dialog" aria-modal="true" aria-live="polite"></div></div>

<script id="init-providers-json" type="application/json">${JSON.stringify(providers).replace(/</g, '\\u003c')}</script>
<script id="init-proxykeys-json" type="application/json">${JSON.stringify(proxyKeys).replace(/</g, '\\u003c')}</script>

<script>${SHARED_JS}
// 1. 内存临时状态（生命周期随 Worker 实例 / 页面会话有效，所有表单修改暂存于此，不单项操作 KV）
// 注意：Cloudflare Workers 运行在无状态多实例 Serverless Container 环境，内存变量仅在单实例生命周期内生效。
var draftProviders = JSON.parse(document.getElementById('init-providers-json').textContent || '[]');
var draftProxyKeys = JSON.parse(document.getElementById('init-proxykeys-json').textContent || '[]');
var isDirty = false;

function markDirty(dirty) {
  isDirty = dirty;
  var badge = document.getElementById('save-status-badge');
  if (badge) {
    if (dirty) {
      badge.className = 'badge-status badge-unsaved';
      badge.innerHTML = '<i class="fas fa-exclamation-triangle" aria-hidden="true"></i> 有未保存的改动';
    } else {
      badge.className = 'badge-status badge-synced';
      badge.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i> 配置已同步 KV';
    }
  }
}

// 同步激活的展开表单输入值到内存暂存状态 draftProviders
function syncActiveFormsToDraft() {
  draftProviders.forEach(function(p) {
    var nmEl = document.getElementById('nm-' + p.id);
    var urlEl = document.getElementById('url-' + p.id);
    var atEl = document.getElementById('at-' + p.id);
    var enEl = document.getElementById('en-' + p.id);
    if (nmEl) p.name = nmEl.value.trim();
    if (urlEl) p.baseUrl = urlEl.value.trim();
    if (atEl) p.apiType = atEl.value;
    if (enEl) p.enabled = enEl.checked;

    var keysContainer = document.getElementById('keys-' + p.id);
    if (keysContainer) {
      p.apiKeys = getKeys(p.id);
    }
    var modelsContainer = document.getElementById('ml-' + p.id);
    if (modelsContainer) {
      p.models = getMdl(p.id);
    }
  });
}

// 统一保存大按钮处理逻辑（含防重复提交与错误弹窗提示）
async function saveAllConfig() {
  var btn = document.getElementById('btn-save-all');
  if (!btn || btn.disabled) return;

  // 防重复提交：置灰按钮
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.style.cursor = 'not-allowed';
  var origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> 正在落盘保存...';

  try {
    syncActiveFormsToDraft();

    var resp = await fetch('/admin/api/save-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: draftProviders,
        proxyKeys: draftProxyKeys
      })
    });

    var data = await resp.json();

    if (data && data.success) {
      toast('保存成功！所有配置已一次性批量落盘写入 KV。', 'success');
      markDirty(false);
    } else {
      var errMsg = (data && data.message) ? data.message : '未知系统错误';
      aM('保存失败：' + errMsg, 'error');
    }
  } catch (err) {
    var errText = (err && err.message) ? err.message : String(err);
    aM('保存配置失败（网络或系统异常）：' + errText, 'error');
  } finally {
    // 请求结束（成功或失败）后解除置灰
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.innerHTML = origHtml;
  }
}

// copy
function copyText(t, el) {
  var text = typeof t === 'string' ? t : '';
  var target = el || (t && t.nodeType ? t : null);
  if (!text && target) {
    text = target.getAttribute('data-copy') || target.dataset.copy || '';
  }
  if (!text && target) {
    var inp = target.parentElement ? target.parentElement.querySelector('input[type=text]') : null;
    if (inp) text = inp.value;
  }
  if (!target) return;
  var i = target.tagName === 'I' ? target : (target.querySelector('i') || (target.parentElement ? target.parentElement.querySelector('i') : null));
  if (!i) { if (text) navigator.clipboard.writeText(text).catch(function() {}); return; }
  var oc = i.className;
  navigator.clipboard.writeText(text).then(function() {
    i.className = 'fas fa-check c-s';
    target.setAttribute('data-state', 'success');
    setTimeout(function() {
      i.className = oc;
      target.removeAttribute('data-state');
    }, 1800);
  }).catch(function() {
    target.setAttribute('data-state', 'error');
  });
}

function copyRowVal(btn) {
  var inp = btn.parentElement.querySelector('input[type=text]');
  if (inp) copyText(inp.value, btn);
}

function addMdlFromBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  var mid = btn.getAttribute('data-mid');
  if (pid) {
    addMdlToEdit(pid, mid);
  } else {
    addMdlToForm(mid);
  }
}

function testMdlBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  var mid = btn.getAttribute('data-mid');
  var idx = parseInt(btn.getAttribute('data-idx') || '0', 10);
  testMdl(pid, mid, idx, btn);
}

function unblockModelBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  var mid = btn.getAttribute('data-mid');
  unblockModel(pid, mid);
}

function resetAllModelsInProviderBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) resetAllModelsInProvider(pid);
}

function updateModelCatBtn(selectEl) {
  var pid = selectEl.getAttribute('data-pid');
  var mid = selectEl.getAttribute('data-mid');
  updateModelCat(pid, mid, selectEl.value);
}

function hideMdlPanelBtn(btn) {
  var pid = btn.getAttribute('data-panel');
  if (pid) hideMdlPanel(pid);
}

function testKeyRowBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  var kidx = parseInt(btn.getAttribute('data-kidx') || '0', 10);
  testKeyRow(pid, kidx, btn);
}

function rmKeyRowBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  var kidx = parseInt(btn.getAttribute('data-kidx') || '0', 10);
  rmKeyRow(pid, kidx);
}

function rmMdlBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  var idx = parseInt(btn.getAttribute('data-idx') || '0', 10);
  rmMdl(pid, idx);
}

function fetchUpstreamModelsBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) fetchUpstreamModels(pid);
}

function showImportModalBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) showImportModal(pid);
}

function clearProviderModelsBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) clearProviderModels(pid);
}

function fetchEditModelsBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) fetchEditModels(pid, btn);
}

function togBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) tog(pid);
}

function togKey(e, el) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    togBtn(el);
  }
}

function togglePbBtn(cb) {
  var pid = cb.getAttribute('data-pid');
  if (pid) togglePb(pid, cb.checked);
}

function addKeyRowBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) addKeyRow(pid);
}

function addMdlBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) addMdl(pid);
}

function delBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) del(pid);
}

function saveBtn(btn) {
  var pid = btn.getAttribute('data-pid');
  if (pid) save(pid, btn);
}

function toggleKeyVisBtn(btn) {
  var id = btn.getAttribute('data-id');
  if (id) toggleKeyVis(id);
}

function toggleProxyKeyBtn(cb) {
  var id = cb.getAttribute('data-id');
  if (id) toggleProxyKey(id, cb.checked);
}

function rmKeyBtn(btn) {
  var id = btn.getAttribute('data-id');
  if (id) rmKey(id);
}

// modal
function showM(h) { document.getElementById('mc').innerHTML = h; document.getElementById('modal').classList.remove('hd') }
function closeM() { document.getElementById('modal').classList.add('hd') }
function cM(msg) {
  return new Promise(r => {
    showM('<h3><i class="fas fa-question-circle c-p"></i> 确认</h3><p>' + msg + '</p><div class="fa"><button class="btn btn-s" onclick="closeM();r(false)">取消</button><button class="btn btn-p" onclick="closeM();r(true)">确定</button></div>')
    window.r = r
  })
}
function pM(msg, def) {
  return new Promise(r => {
    showM('<h3><i class="fas fa-pen c-p"></i> ' + msg + '</h3><div class="fg"><input type="text" id="pv" value="' + (def || '') + '" placeholder="请输入"></div><div class="fa"><button class="btn btn-s" id="pMc">取消</button><button class="btn btn-p" id="pMo">确定</button></div>')
    window.r = r
    const inp = document.getElementById('pv')
    if (inp) {
      inp.focus()
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { closeM(); r(inp.value.trim()) }
      })
    }
    document.getElementById('pMc').addEventListener('click', function() { closeM(); r(null) })
    document.getElementById('pMo').addEventListener('click', function() { closeM(); r(inp.value.trim()) })
  })
}
function aM(msg, t) {
  const i = t === 'success' ? 'fa-check-circle c-s' : 'fa-exclamation-circle c-d'
  showM('<h3><i class="fas ' + i + '"></i> ' + (t === 'success' ? '成功' : '提示') + '</h3><p>' + msg + '</p><div class="fa"><button class="btn btn-p" onclick="closeM()">确定</button></div>')
}

function toast(msg, t) {
  const el = document.getElementById('toast')
  const i = t === 'success' ? 'fa-check-circle' : 'fa-times-circle'
  const cls = t === 'success' ? 'al-s' : 'al-e'
  el.innerHTML = '<div class="al ' + cls + '"><i class="fas ' + i + '"></i> ' + escapeHtml(msg) + '</div>'
  el.classList.remove('hd')
  setTimeout(() => el.classList.add('hd'), 3000)
}

// providers UI render
function tog(id) {
  const d = document.getElementById('dt-' + id), c = document.getElementById('ch-' + id)
  if (d && c) {
    d.classList.toggle('open')
    c.style.transform = d.classList.contains('open') ? 'rotate(90deg)' : ''
    const card = d.closest('.pi')
    if (card) card.classList.toggle('open', d.classList.contains('open'))
  }
}

function showAdd() {
  resetAddForm();
  document.getElementById('af').classList.remove('hd');
}
function hideAdd() { document.getElementById('af').classList.add('hd'); document.getElementById('amc').classList.add('hd') }

function resetAddForm() {
  const anm = document.getElementById('anm');
  const aid = document.getElementById('aid');
  const aurl = document.getElementById('aurl');
  const afmt = document.getElementById('afmt');
  const akeys = document.getElementById('akeys');
  const amodels = document.getElementById('amodels');
  const aen = document.getElementById('aen');
  const atestR = document.getElementById('atestR');

  if (anm) anm.value = '';
  if (aid) aid.value = '';
  if (aurl) aurl.value = '';
  if (afmt) afmt.value = 'openai';
  if (aen) aen.checked = true;
  if (atestR) atestR.innerHTML = '';

  if (akeys) {
    akeys.innerHTML = '<div class="fc mb-4 field-row"><input type="text" placeholder="sk-xxx" class="fx1 aki" aria-label="上游 API Key"><label class="tg" title="启用 Key"><input type="checkbox" checked class="ake" aria-label="启用 Key"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button><button class="icon-btn" onclick="testNewAKey(this)" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug" aria-hidden="true"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times" aria-hidden="true"></i></button></div>';
  }
  if (amodels) {
    amodels.innerHTML = '<div class="fc mb-4 field-row"><input type="text" placeholder="deepseek-chat" class="fx1 ami" aria-label="模型 ID"><label class="tg" title="启用模型"><input type="checkbox" checked class="ame" aria-label="启用模型"><span class="sl"></span></label><button class="icon-btn" onclick="testNewMdl(this)" title="测试模型" aria-label="测试模型"><i class="fas fa-plug" aria-hidden="true"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除模型" aria-label="移除模型"><i class="fas fa-times" aria-hidden="true"></i></button></div>';
  }
  const amcl = document.getElementById('amcl');
  if (amcl) amcl.innerHTML = '';
  hideMdlPanel('amc');
}

document.getElementById('aid').addEventListener('input', function() {
  if (this.value.trim() === 'opencode') {
    document.getElementById('aurl').value = '${OPENCODE_DEFAULT_URL}'
  }
})

function addAKeyRow() {
  const c = document.getElementById('akeys')
  const d = document.createElement('div')
  d.className = 'fc mb-4 field-row'
  d.innerHTML = '<input type="text" placeholder="sk-xxx" class="fx1 aki" aria-label="上游 API Key"><label class="tg"><input type="checkbox" checked class="ake" aria-label="启用 Key"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy"></i></button><button class="icon-btn" onclick="testNewAKey(this)" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times"></i></button>'
  c.appendChild(d)
}

function renderModelGrid(models, editId, providerId) {
  if (providerId === 'opencode') {
    models = (models || []).filter(function(m) {
      return m && typeof m.id === 'string' && /^[A-Za-z0-9._:/-]+$/.test(m.id) && (m.id === 'big-pickle' || m.id.endsWith('-free'))
    })
  }
  if (!models || models.length === 0) return '<span class="mu">未返回模型列表</span>'
  var h = models.map(function(m) {
    var modelId = String(m.id || '')
    var safeId = escapeHtml(modelId)
    return '<div class="mdl-item">' +
      '<i class="fas fa-cube"></i>' +
      '<span class="fx1 cp ov" onclick="copyText(this)" data-copy="' + safeId + '">' + safeId + '</span>' +
      '<button class="btn btn-gh btn-xs mdl-add-btn" onclick="addMdlFromBtn(this)" data-pid="' + escapeHtml(editId || '') + '" data-mid="' + safeId + '" title="添加到表单">+</button></div>'
  }).join('')
  return '<div class="grid-2-gap6">' + h + '</div>'
}

function modelPanelHeading(panelId, pid) {
  var importBtn = pid ? '<button class="btn btn-s btn-xs" onclick="importAllEditModels(\\\'' + escapeHtml(pid) + '\\\')" style="margin-right:8px;"><i class="fas fa-file-import" aria-hidden="true"></i> 一键导入</button>' : '';
  return '<div class="panel-heading"><div>' +
    '<span class="panel-heading__mark"><i class="fas fa-cube" aria-hidden="true"></i></span>' +
    '<div><h3>可用模型</h3><p>点击“+”单条添加，或使用一键导入。</p></div></div>' +
    '<div class="fc" style="gap:var(--space-2xs);">' + importBtn +
    '<button class="icon-btn" type="button" onclick="hideMdlPanelBtn(this)" data-panel="' + escapeHtml(panelId) + '" title="关闭可用模型" aria-label="关闭可用模型"><i class="fas fa-times" aria-hidden="true"></i></button></div></div>'
}

function importAllNewModels() {
  const btns = document.querySelectorAll('#amcl .mdl-add-btn');
  if (btns.length === 0) {
    toast('无可用模型可导入', 'warning');
    return;
  }
  let count = 0;
  btns.forEach(btn => {
    const mid = btn.getAttribute('data-mid');
    if (mid) {
      const inputs = document.querySelectorAll('#amodels .ami');
      let exists = false;
      for (const input of Array.from(inputs)) {
        if (input.value.trim() === mid.trim()) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        addMdlToForm(mid);
        count++;
      }
    }
  });
  toast('成功导入 ' + count + ' 个模型' + (count < btns.length ? '（已自动过滤重复项）' : ''), 'success');
}

function importAllEditModels(pid) {
  const container = document.getElementById('melc-' + pid);
  if (!container) return;
  const btns = container.querySelectorAll('.mdl-add-btn');
  if (btns.length === 0) {
    toast('无可用模型可导入', 'warning');
    return;
  }
  let count = 0;
  btns.forEach(btn => {
    const mid = btn.getAttribute('data-mid');
    if (mid) {
      const inputs = document.querySelectorAll('#ml-' + pid + ' input.fx1');
      let exists = false;
      for (const input of Array.from(inputs)) {
        if (input.value.trim() === mid.trim()) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        const inp = document.getElementById('nmid-' + pid);
        if (inp) {
          inp.value = mid;
          addMdl(pid);
        }
        count++;
      }
    }
  });
  toast('成功导入 ' + count + ' 个模型' + (count < btns.length ? '（已自动过滤重复项）' : ''), 'success');
}

function clearAllNewModels() {
  const c = document.getElementById('amodels');
  if (c) {
    c.innerHTML = '';
    toast('已清空新增提供商下的所有模型列表', 'success');
  }
}

function clearAllEditModels(pid) {
  const c = document.getElementById('ml-' + pid);
  if (c) {
    c.innerHTML = '';
    markDirty(true);
    toast('已清空该提供商下的所有模型列表，请点击【保存更改】以使变更生效', 'success');
  }
}

function hideMdlPanel(panelId) {
  document.getElementById(panelId).classList.add('hd')
}

async function testNewAKey(btn) {
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  try {
    const inp = btn.parentElement.querySelector('.aki'), k = inp.value.trim()
    const providerId = document.getElementById('aid').value.trim()
    if (!k && providerId !== 'opencode') { toast('请输入 API Key', 'error'); return }
    const url = document.getElementById('aurl').value.trim()
    if (!url) { toast('请先填写 API 地址', 'error'); return }
    const apiType = document.getElementById('afmt').value
    const tr = document.getElementById('atestR')
    showSpinner(tr)
    const result = await testKeyConnection(url, apiType, k, providerId)
    if (result.success && result.data) {
      document.getElementById('amcl').innerHTML = renderModelGrid(result.data.data || [], null, providerId)
      document.getElementById('amc').classList.remove('hd')
    } else {
      document.getElementById('amc').classList.add('hd')
    }
    showResult(tr, result.success, result.success ? '' : 'HTTP ' + result.status)
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

function addMdlRow() {
  const c = document.getElementById('amodels')
  const d = document.createElement('div')
  d.className = 'fc mb-4 field-row'
  d.innerHTML = '<input type="text" placeholder="deepseek-chat" class="fx1 ami" aria-label="模型 ID"><label class="tg"><input type="checkbox" checked class="ame" aria-label="启用模型"><span class="sl"></span></label><button class="icon-btn" onclick="testNewMdl(this)" title="测试模型" aria-label="测试模型"><i class="fas fa-plug"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除模型" aria-label="移除模型"><i class="fas fa-times"></i></button>'
  c.appendChild(d)
}

function addMdlToForm(mid) {
  const inputs = document.querySelectorAll('#amodels .ami');
  for (const input of Array.from(inputs)) {
    if (input.value.trim() === mid.trim()) {
      toast('模型 ' + mid + ' 已在列表中，已自动剔除重复项', 'warning');
      return;
    }
  }
  const c = document.getElementById('amodels')
  const d = document.createElement('div')
  d.className = 'fc mb-4 field-row'
  d.innerHTML = '<input type="text" value="' + escapeHtml(mid) + '" class="fx1 ami" aria-label="模型 ID"><label class="tg"><input type="checkbox" checked class="ame" aria-label="启用模型"><span class="sl"></span></label><button class="icon-btn" onclick="testNewMdl(this)" title="测试模型" aria-label="测试模型"><i class="fas fa-plug"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除模型" aria-label="移除模型"><i class="fas fa-times"></i></button>'
  c.appendChild(d)
}

async function testNewMdl(btn) {
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  try {
    const inp = btn.parentElement.querySelector('.ami'), mid = inp.value.trim()
    if (!mid) { toast('请输入模型 ID', 'error'); return }
    const url = document.getElementById('aurl').value.trim()
    const akeys = document.querySelectorAll('#akeys .aki')
    const configuredKey = Array.from(akeys).map(function(inp) { return inp.value.trim() }).filter(Boolean)[0] || ''
    const apiType = document.getElementById('afmt').value
    const tr = document.getElementById('atestR')
    showSpinner(tr)
    const providerId = document.getElementById('aid').value.trim()
    const apiKey = configuredKey || (providerId === 'opencode' ? '' : 'dummy')
    const result = await testModelConnection(url, apiType, apiKey, mid, providerId)
    showResult(tr, result.success, result.success ? '' : 'HTTP ' + result.status)
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

function createProv() {
  var createBtn = document.querySelector('#af .panel-actions button.btn-p');
  if (createBtn) { createBtn.disabled = true; createBtn.style.opacity = '0.6'; }
  try {
    var nm = document.getElementById('anm').value.trim();
    var id = document.getElementById('aid').value.trim();
    var url = document.getElementById('aurl').value.trim();
    var apiType = document.getElementById('afmt').value;
    var aki = document.querySelectorAll('#akeys .aki');
    var seenKeys = new Set();
    var keys = Array.from(aki).map(function(inp) {
      var k = inp.value.trim();
      if (!k) return null;
      if (seenKeys.has(k)) {
        if (inp.parentElement) inp.parentElement.remove();
        return null;
      }
      seenKeys.add(k);
      var akeEl = inp.parentElement ? inp.parentElement.querySelector('.ake') : null;
      var en = akeEl ? akeEl.checked : true;
      return { key: k, enabled: en };
    }).filter(Boolean);
    var ami = document.querySelectorAll('#amodels .ami');
    var seenModels = new Set();
    var models = Array.from(ami).map(function(inp) {
      var mid = inp.value.trim();
      if (!mid) return null;
      if (seenModels.has(mid)) {
        if (inp.parentElement) inp.parentElement.remove();
        return null;
      }
      seenModels.add(mid);
      var ameEl = inp.parentElement ? inp.parentElement.querySelector('.ame') : null;
      var en = ameEl ? ameEl.checked : true;
      return { id: mid, enabled: en };
    }).filter(Boolean);
    var enabled = document.getElementById('aen').checked;

    if (!nm || !id || !url) { toast('请填写名称、ID 和 API 地址', 'error'); return; }
    if (draftProviders.some(function(p) { return p.id === id; })) {
      toast('提供商 ID "' + id + '" 已存在', 'error');
      return;
    }

    var now = new Date().toISOString();
    draftProviders.push({
      id: id,
      name: nm,
      baseUrl: url,
      apiType: apiType,
      apiKeys: keys,
      models: models,
      enabled: enabled,
      createdAt: now,
      updatedAt: now
    });

    markDirty(true);
    hideAdd();
    resetAddForm();
    renderProviderList();
    toast('提供商已添加至暂存，请点击【统一保存】写入 KV', 'success');
  } finally {
    if (createBtn) { createBtn.disabled = false; createBtn.style.opacity = '1'; }
  }
}

function getKeys(id) {
  const c = document.getElementById('keys-' + id)
  if (!c) return []
  const items = c.querySelectorAll('[data-kidx]')
  const seen = new Set()
  return Array.from(items).map(item => {
    const idx = parseInt(item.dataset.kidx)
    const inp = document.getElementById('k-' + id + '-' + idx)
    const chk = document.getElementById('ken-' + id + '-' + idx)
    const k = inp ? inp.value.trim() : ''
    if (!k) return null
    if (seen.has(k)) {
      item.remove()
      return null
    }
    seen.add(k)
    const en = chk ? chk.checked : true
    return { key: k, enabled: en }
  }).filter(Boolean)
}

function addKeyRow(id) {
  const inp = document.getElementById('nk-' + id), k = inp.value.trim()
  if (!k) { toast('请输入 API Key', 'error'); return }
  const c = document.getElementById('keys-' + id)
  
  // Check duplicate key
  const inputs = c.querySelectorAll('input[id^="k-"]')
  for (const input of Array.from(inputs)) {
    if (input.value.trim() === k) {
      toast('API Key 已在配置中，已自动剔除重复项', 'warning')
      inp.value = ''
      return
    }
  }

  let maxIdx = -1
  c.querySelectorAll('[data-kidx]').forEach(item => {
    const kidx = parseInt(item.dataset.kidx || '-1', 10)
    if (kidx > maxIdx) maxIdx = kidx
  })
  const cnt = maxIdx + 1
  const d = document.createElement('div')
  d.className = 'fc mb-3 field-row'
  d.dataset.kidx = cnt
  d.innerHTML = '<input type="text" value="' + escapeHtml(k) + '" class="fx1" id="k-' + id + '-' + cnt + '" placeholder="API Key"><label class="tg"><input type="checkbox" checked id="ken-' + id + '-' + cnt + '" onchange="markDirty(true)"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy"></i></button><button class="icon-btn" onclick="testKeyRowBtn(this)" data-pid="' + escapeHtml(id) + '" data-kidx="' + cnt + '" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug"></i></button><button class="icon-btn" onclick="rmKeyRowBtn(this)" data-pid="' + escapeHtml(id) + '" data-kidx="' + cnt + '" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times"></i></button>'
  c.appendChild(d)
  inp.value = ''
  inp.focus()
  markDirty(true)
}

function rmKeyRow(id, idx) {
  const c = document.getElementById('keys-' + id)
  if (c) {
    c.querySelectorAll('[data-kidx]').forEach(item => {
      if (parseInt(item.dataset.kidx) === idx) item.remove()
    })
    markDirty(true)
  }
}

async function testKeyRow(id, idx, btn) {
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  try {
    const inp = document.getElementById('k-' + id + '-' + idx)
    const urlInp = document.getElementById('url-' + id)
    const k = inp ? inp.value.trim() : ''
    const url = urlInp ? urlInp.value.trim() : ''
    if (!k) { toast('请输入 API Key', 'error'); return }
    const apiType = document.getElementById('at-' + id).value
    const tr = document.getElementById('tr-' + id)
    showSpinner(tr)
    const result = await testKeyConnection(url, apiType, k, id)
    showResult(tr, result.success, result.success ? '' : 'HTTP ' + result.status)
    if (result.success && result.data) {
      showEditModelsList(id, result.data.data || [])
    }
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

async function fetchEditModels(id, btn) {
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  try {
    const urlInp = document.getElementById('url-' + id)
    const url = urlInp ? urlInp.value.trim() : ''
    const keys = getKeys(id)
    const apiKey = keys.length > 0 ? keys[0].key : ''
    const apiType = document.getElementById('at-' + id).value
    const tr = document.getElementById('tr-' + id)
    showSpinner(tr)
    const result = await testKeyConnection(url, apiType, apiKey, id)
    showResult(tr, result.success, result.success ? '' : escapeHtml(result.message || '获取模型失败'))
    if (result.success && result.data) {
      showEditModelsList(id, result.data.data || [])
    }
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

function showEditModelsList(id, models) {
  const cid = 'mel-' + id
  let el = document.getElementById(cid)
  if (!el) {
    const keysFs = document.getElementById('keys-' + id).closest('fieldset')
    el = document.createElement('aside')
    el.id = cid
    el.className = 'mdl-list-panel'
    el.innerHTML = modelPanelHeading(cid, id) + '<div id="melc-' + id + '"></div>'
    keysFs.insertAdjacentElement('afterend', el)
  }
  el.classList.remove('hd')
  document.getElementById('melc-' + id).innerHTML = renderModelGrid(models, id, id)
}

function addMdlToEdit(id, mid) {
  document.getElementById('nmid-' + id).value = mid
  addMdl(id)
}

function getMdl(id) {
  const c = document.getElementById('ml-' + id)
  if (!c) return []
  const items = c.querySelectorAll('[data-idx]')
  const seen = new Set()
  return Array.from(items).map(item => {
    const idx = parseInt(item.dataset.idx)
    const inp = document.getElementById('mid-' + id + '-' + idx)
    const chk = document.getElementById('men-' + id + '-' + idx)
    const mid = inp ? inp.value.trim() : ''
    if (!mid) return null
    if (seen.has(mid)) {
      item.remove()
      return null
    }
    seen.add(mid)
    const en = chk ? chk.checked : true
    return { id: mid, enabled: en }
  }).filter(Boolean)
}

function addMdl(id) {
  const inp = document.getElementById('nmid-' + id), mid = inp ? inp.value.trim() : ''
  if (!mid) { toast('请输入模型 ID', 'error'); return }
  
  // Check duplicate
  const inputs = document.querySelectorAll('#ml-' + id + ' input[id^="mid-"]');
  for (const input of Array.from(inputs)) {
    if (input.value.trim() === mid) {
      toast('模型 ' + mid + ' 已在配置中，已自动剔除重复项', 'warning');
      if (inp) inp.value = '';
      return;
    }
  }

  const c = document.getElementById('ml-' + id)
  let maxIdx = -1
  c.querySelectorAll('[data-idx]').forEach(item => {
    const idx = parseInt(item.dataset.idx || '-1', 10)
    if (idx > maxIdx) maxIdx = idx
  })
  const cnt = maxIdx + 1
  const d = document.createElement('div')
  d.className = 'fc mb-3 field-row model-single-row'
  d.dataset.idx = cnt
  d.innerHTML = '<input type="text" value="' + escapeHtml(mid) + '" class="fx1 model-id-input" id="mid-' + escapeHtml(id) + '-' + cnt + '" placeholder="模型 ID"><span id="lat-' + escapeHtml(id) + '-' + cnt + '" class="latency-chip" title="点击图标测试延迟"><i class="fas fa-gauge-high"></i> <span class="lat-val">-- ms</span></span><label class="tg" title="启用模型"><input type="checkbox" checked id="men-' + escapeHtml(id) + '-' + cnt + '" onchange="markDirty(true)"><span class="sl"></span></label><button class="icon-btn test-mdl-btn" id="tm-' + escapeHtml(id) + '-' + cnt + '" title="单独测试模型延迟" aria-label="测试模型延迟"><i class="fas fa-gauge-high"></i></button><button class="icon-btn" id="rm-' + escapeHtml(id) + '-' + cnt + '" title="移除模型" aria-label="移除模型"><i class="fas fa-times"></i></button>'
  c.appendChild(d)
  document.getElementById('tm-' + id + '-' + cnt).addEventListener('click', function() { testMdl(id, mid, cnt, this) })
  document.getElementById('rm-' + id + '-' + cnt).addEventListener('click', function() { rmMdl(id, cnt) })
  inp.value = ''
  markDirty(true)
}

function rmMdl(id, idx) {
  const c = document.getElementById('ml-' + id)
  if (c) {
    c.querySelectorAll('[data-idx]').forEach(item => {
      if (parseInt(item.dataset.idx) === idx) item.remove()
    })
    markDirty(true)
  }
}

async function testMdl(id, mid, idx, btn) {
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  const row = btn ? btn.closest('.model-single-row') : null;
  const latEl = row ? row.querySelector('.latency-chip') : document.getElementById('lat-' + id + '-' + idx);
  if (latEl) {
    latEl.className = 'latency-chip lat-loading';
    latEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 测速中';
  }
  try {
    const tr = document.getElementById('tr-' + id)
    if (tr) showSpinner(tr)
    const r = await fetch('/admin/api/providers/' + encodeURIComponent(id) + '/test-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: mid })
    })
    const d = await r.json()
    if (d.success && d.data) {
      const latencyMs = d.data.latencyMs || 0;
      if (d.data.success) {
        if (latEl) {
          latEl.className = 'latency-chip lat-ok';
          latEl.innerHTML = '<i class="fas fa-bolt"></i> ' + latencyMs + ' ms';
        }
        if (tr) showResult(tr, true, mid + ' 响应: ' + latencyMs + ' ms')
        toast(mid + ' 测速成功: ' + latencyMs + ' ms', 'success')
      } else {
        if (latEl) {
          latEl.className = 'latency-chip lat-err';
          latEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 失败 (' + (latencyMs ? latencyMs + 'ms' : '超时') + ')';
        }
        if (tr) showResult(tr, false, d.data.message || '连接失败')
        toast(mid + ' 测试失败: ' + (d.data.message || '连接错误'), 'error')
      }
    } else {
      if (latEl) {
        latEl.className = 'latency-chip lat-err';
        latEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 失败';
      }
      if (tr) showResult(tr, false, d.message || '测试失败')
      toast('测试失败: ' + (d.message || '未知错误'), 'error')
    }
  } catch (e) {
    if (latEl) {
      latEl.className = 'latency-chip lat-err';
      latEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 请求错误';
    }
    toast('网络请求失败', 'error')
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

async function testAllModelsInProviderBtn(btn) {
  var pId = btn.dataset.pid;
  if (!pId) return;
  btn.disabled = true;
  btn.style.opacity = '0.6';
  toast('开始批量测试模型延迟...', 'info');
  try {
    var c = document.getElementById('ml-' + pId);
    if (!c) return;
    var testBtns = c.querySelectorAll('.test-mdl-btn');
    for (var i = 0; i < testBtns.length; i++) {
      var b = testBtns[i];
      var mid = b.dataset.mid;
      var idx = b.dataset.idx;
      await testMdl(pId, mid, idx, b);
    }
    toast('提供商 ' + pId + ' 模型测速已完成', 'success');
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

function save(id, btn) {
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  try {
    var p = draftProviders.find(function(item) { return item.id === id; });
    if (!p) return;
    var nmInp = document.getElementById('nm-' + id);
    var urlInp = document.getElementById('url-' + id);
    var atInp = document.getElementById('at-' + id);
    var enInp = document.getElementById('en-' + id);

    p.name = nmInp ? nmInp.value.trim() : p.name;
    p.baseUrl = urlInp ? urlInp.value.trim() : p.baseUrl;
    p.apiType = atInp ? atInp.value : p.apiType;
    p.apiKeys = getKeys(id);
    p.models = getMdl(id);
    p.enabled = enInp ? enInp.checked : p.enabled;
    p.updatedAt = new Date().toISOString();

    markDirty(true);
    renderProviderList();
    toast('已暂存 [' + id + '] 的修改，点击【统一保存】后写入 KV', 'success');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

async function del(id) {
  if (!(await cM('确定要删除此提供商？'))) return;
  draftProviders = draftProviders.filter(function(p) { return p.id !== id; });
  markDirty(true);
  renderProviderList();
  toast('已删除提供商（暂存内存，需点击【统一保存】写入 KV）', 'success');
}

function togglePb(id, checked) {
  var p = draftProviders.find(function(item) { return item.id === id; });
  if (p) {
    p.enabled = checked;
    markDirty(true);
    var pi = document.querySelector('.pi[data-id="' + id + '"]');
    if (pi) {
      var b = pi.querySelector('.ps .bd');
      if (b) { b.textContent = checked ? '已启用' : '未启用'; b.className = 'bd ' + (checked ? 'bd-on' : 'bd-off'); }
    }
    toast('已调整启用状态（暂存内存，点击【统一保存】写入 KV）', 'success');
  }
}

// proxy keys
async function genKey() {
  const name = await pM('输入 Key 名称（可选）')
  if (name === null) return
  showM('<h3><i class="fas fa-key c-p"></i> 生成转发 Key</h3><div class="fg"><label>有效期</label><select id="exp"><option value="30d">30 天</option><option value="90d">90 天</option><option value="180d">180 天</option><option value="1y">1 年</option><option value="forever" selected>永久</option></select></div><div class="fa"><button class="btn btn-s" id="gKc">取消</button><button class="btn btn-p" id="gKo">生成</button></div>')
  document.getElementById('gKc').addEventListener('click', closeM)
  document.getElementById('gKo').addEventListener('click', function() { doGenKey(document.getElementById('exp').value, name) })
}

function doGenKey(exp, name) {
  closeM();
  var nm = name || ('Key-' + new Date().toLocaleDateString());
  var id = 'pk_' + Math.random().toString(36).substring(2, 10);
  var randomStr = Array.from({length: 24}, function() { return Math.floor(Math.random() * 16).toString(16); }).join('');
  var key = 'sk-cf-' + randomStr;

  var expiresAt = null;
  var now = Date.now();
  if (exp === '30d') expiresAt = new Date(now + 30 * 86400 * 1000).toISOString();
  else if (exp === '90d') expiresAt = new Date(now + 90 * 86400 * 1000).toISOString();
  else if (exp === '180d') expiresAt = new Date(now + 180 * 86400 * 1000).toISOString();
  else if (exp === '1y') expiresAt = new Date(now + 365 * 86400 * 1000).toISOString();

  draftProxyKeys.push({
    id: id,
    key: key,
    name: nm,
    enabled: true,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt
  });

  markDirty(true);
  renderProxyKeyList();
  showM('<h3><i class="fas fa-check-circle c-s"></i> 生成成功（已存内存）</h3><p>请妥善保存此 Key（需点击【统一保存】写入 KV）：</p><div class="mk">' + key + '</div><div class="fa"><button class="btn btn-p" onclick="closeM()">确定</button></div>');
}

async function rmKey(id) {
  if (!(await cM('确定要删除此 Key？'))) return;
  draftProxyKeys = draftProxyKeys.filter(function(k) { return k.id !== id; });
  markDirty(true);
  renderProxyKeyList();
  toast('已删除转发 Key（暂存内存，点击【统一保存】后生效）', 'success');
}

function toggleProxyKey(id, checked) {
  var k = draftProxyKeys.find(function(item) { return item.id === id; });
  if (k) {
    k.enabled = checked;
    markDirty(true);
    var ki = document.querySelector('.ki[data-id="' + id + '"]');
    if (ki) {
      var b = ki.querySelector('.key-actions .bd');
      if (b) { b.textContent = checked ? '已启用' : '已禁用'; b.className = 'bd ' + (checked ? 'bd-on' : 'bd-off'); }
    }
    toast('已调整 Key 状态（暂存内存，点击【统一保存】写入 KV）', 'success');
  }
}

function toggleKeyVis(id) {
  const el = document.getElementById('kv-' + id)
  if (!el) return
  const full = el.dataset.full
  const vis = el.dataset.vis === '1'
  if (vis) {
    el.textContent = full.length > 12
      ? full.substring(0, 8) + '*****' + full.substring(full.length - 4)
      : full
    el.dataset.vis = '0'
  } else {
    el.textContent = full
    el.dataset.vis = '1'
  }
}

function renderProviderList() {
  const container = document.getElementById('plist');
  if (!container) return;

  if (!draftProviders || draftProviders.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-server" aria-hidden="true"></i><h3>还没有提供商</h3><p>添加第一个上游提供商，配置 API 地址、Key 和模型。</p><button class="btn btn-p" onclick="showAdd()">添加提供商</button></div>';
    return;
  }

  container.innerHTML = draftProviders.map(function(p) {
    var pName = escapeHtml(p.name || '');
    var pId = escapeHtml(p.id || '');
    var pUrl = escapeHtml(p.baseUrl || '');
    var pApiType = p.apiType || 'openai';
    var isAnthropic = pApiType === 'anthropic';
    var isEnabled = p.enabled !== false;
    var keysArr = p.apiKeys || [];
    var modelsArr = p.models || [];

    var abnormalCount = 0;
    modelsArr.forEach(function(m) {
      if (m.permanentlyDisabled || (m.cooldownUntil && Date.now() < m.cooldownUntil) || (m.failureCount && m.failureCount > 0)) {
        abnormalCount++;
      }
    });

    var abnormalBadge = abnormalCount > 0
      ? '<span style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:2px 8px;font-size:11px;border-radius:10px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-exclamation-triangle"></i> ' + abnormalCount + '个模型存在异常</span>'
      : '';

    var keysHtml = keysArr.map(function(k, ki) {
      return '<div class="fc mb-3 field-row" data-kidx="' + ki + '">' +
        '<input type="text" value="' + escapeHtml(k.key || '') + '" class="fx1" id="k-' + pId + '-' + ki + '" placeholder="API Key" aria-label="API Key">' +
        '<label class="tg"><input type="checkbox" ' + (k.enabled ? 'checked' : '') + ' id="ken-' + pId + '-' + ki + '" onchange="markDirty(true)" aria-label="启用 Key"><span class="sl"></span></label>' +
        '<button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button>' +
        '<button class="icon-btn" onclick="testKeyRowBtn(this)" data-pid="' + pId + '" data-kidx="' + ki + '" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug" aria-hidden="true"></i></button>' +
        '<button class="icon-btn" onclick="rmKeyRowBtn(this)" data-pid="' + pId + '" data-kidx="' + ki + '" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times" aria-hidden="true"></i></button>' +
        '</div>';
    }).join('');

    var modelsHtml = modelsArr.map(function(m, mi) {
      var mId = escapeHtml(m.id || '');
      var mCat = m.category || '文本';
      var isPermDisabled = !!m.permanentlyDisabled;
      var permReason = m.disabledReason || '受上游故障影响永久失效';
      var isCooldown = m.cooldownUntil && Date.now() < m.cooldownUntil;
      var cooldownSec = isCooldown ? Math.ceil((m.cooldownUntil - Date.now()) / 1000) : 0;
      var failCount = m.failureCount || 0;

      var statusBadge = '';
      if (isPermDisabled) {
        statusBadge = '<span class="bd" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:2px 6px;font-size:11px;border-radius:4px;font-weight:600;" title="' + escapeHtml(permReason) + '"><i class="fas fa-ban"></i> 永久失效 (' + failCount + '/3)</span>' +
          '<button class="btn btn-s btn-xs" style="padding:2px 6px;font-size:11px;" onclick="unblockModelBtn(this)" data-pid="' + pId + '" data-mid="' + mId + '" title="一键解封并恢复状态"><i class="fas fa-unlock"></i> 解封恢复</button>';
      } else if (isCooldown) {
        statusBadge = '<span class="bd" style="background:#fefce8;color:#ca8a04;border:1px solid #fef08a;padding:2px 6px;font-size:11px;border-radius:4px;font-weight:600;" title="因异常进入冷却状态"><i class="fas fa-hourglass-half"></i> 冷却中 (' + cooldownSec + 's)</span>' +
          '<button class="btn btn-s btn-xs" style="padding:2px 6px;font-size:11px;" onclick="unblockModelBtn(this)" data-pid="' + pId + '" data-mid="' + mId + '" title="重置冷却状态"><i class="fas fa-redo"></i> 重置冷却</button>';
      } else if (failCount > 0) {
        statusBadge = '<span class="bd" style="background:#fff7ed;color:#ea580c;border:1px solid #ffedd5;padding:2px 6px;font-size:11px;border-radius:4px;font-weight:600;" title="曾出现探测或业务异常"><i class="fas fa-exclamation-triangle"></i> 警告 (失败 ' + failCount + '/3)</span>' +
          '<button class="btn btn-s btn-xs" style="padding:2px 6px;font-size:11px;" onclick="unblockModelBtn(this)" data-pid="' + pId + '" data-mid="' + mId + '" title="清零失败计数"><i class="fas fa-check"></i> 清零恢复</button>';
      } else if (m.enabled !== false) {
        statusBadge = '<span class="bd bd-on" style="padding:2px 6px;font-size:11px;border-radius:4px;"><i class="fas fa-check-circle"></i> 正常</span>';
      } else {
        statusBadge = '<span class="bd bd-off" style="padding:2px 6px;font-size:11px;border-radius:4px;"><i class="fas fa-minus-circle"></i> 已禁用</span>';
      }

      var catSelect = '<select class="select-xs" style="padding:2px 6px;font-size:11px;border-radius:4px;" onchange="updateModelCatBtn(this)" data-pid="' + pId + '" data-mid="' + mId + '" title="修改智能分类">' +
        '<option value="文本" ' + (mCat === '文本' ? 'selected' : '') + '>文本</option>' +
        '<option value="绘图" ' + (mCat === '绘图' ? 'selected' : '') + '>绘图</option>' +
        '<option value="多模态" ' + (mCat === '多模态' ? 'selected' : '') + '>多模态</option>' +
        '<option value="其他" ' + (mCat === '其他' ? 'selected' : '') + '>其他</option>' +
        '</select>';

      return '<div class="fc field-row model-single-row" data-idx="' + mi + '">' +
        '<input type="text" value="' + mId + '" class="fx1 model-id-input" id="mid-' + pId + '-' + mi + '" placeholder="模型 ID">' +
        catSelect +
        statusBadge +
        '<span id="lat-' + pId + '-' + mi + '" class="latency-chip" title="模型通信延迟"><i class="fas fa-gauge-high"></i> <span class="lat-val">-- ms</span></span>' +
        '<label class="tg" title="启用模型"><input type="checkbox" ' + (m.enabled !== false ? 'checked' : '') + ' id="men-' + pId + '-' + mi + '" onchange="markDirty(true)" aria-label="启用模型"><span class="sl"></span></label>' +
        '<button class="icon-btn test-mdl-btn" onclick="testMdlBtn(this)" data-pid="' + pId + '" data-mid="' + mId + '" data-idx="' + mi + '" title="单独测试模型延迟" aria-label="测试模型延迟"><i class="fas fa-gauge-high" aria-hidden="true"></i></button>' +
        '<button class="icon-btn" onclick="rmMdlBtn(this)" data-pid="' + pId + '" data-idx="' + mi + '" title="移除模型" aria-label="移除模型"><i class="fas fa-times" aria-hidden="true"></i></button>' +
        '</div>';
    }).join('');

    var pStatusClass = '';
    if (!modelsArr || modelsArr.length === 0) {
      pStatusClass = 'pi-red';
    } else {
      var allDisabled = modelsArr.every(function(m) {
        return m.enabled === false || !!m.permanentlyDisabled;
      });
      if (allDisabled) {
        pStatusClass = 'pi-red';
      } else {
        var hasAbnormal = modelsArr.some(function(m) {
          return m.enabled === false || !!m.permanentlyDisabled || (m.cooldownUntil && Date.now() < m.cooldownUntil);
        });
        if (hasAbnormal) {
          pStatusClass = 'pi-yellow';
        }
      }
    }

    var providerModelActions = '<div class="fc mb-3" style="gap:8px;flex-wrap:wrap;background:var(--color-paper);padding:8px 12px;border-radius:var(--radius-control);border:1px solid var(--color-rule);">' +
      '<button class="btn btn-s btn-xs" onclick="testAllModelsInProviderBtn(this)" data-pid="' + pId + '"><i class="fas fa-gauge-high"></i> 批量测模型延迟</button>' +
      '<button class="btn btn-s btn-xs" onclick="fetchUpstreamModelsBtn(this)" data-pid="' + pId + '"><i class="fas fa-cloud-download-alt"></i> 一键拉取上游模型</button>' +
      '<button class="btn btn-s btn-xs" onclick="showImportModalBtn(this)" data-pid="' + pId + '"><i class="fas fa-file-import"></i> 一键导入</button>' +
      (abnormalCount > 0 ? '<button class="btn btn-s btn-xs" onclick="resetAllModelsInProviderBtn(this)" data-pid="' + pId + '" style="color:#d97706;border-color:#fcd34d;"><i class="fas fa-sync-alt"></i> 一键重置本提供商所有模型异常</button>' : '') +
      '<button class="btn btn-d btn-xs" onclick="clearProviderModelsBtn(this)" data-pid="' + pId + '"><i class="fas fa-trash-alt"></i> 一键删除全部本提供商模型</button>' +
      '</div>';

    var opencodeBtn = pId === 'opencode'
      ? '<button class="btn btn-s" onclick="fetchEditModelsBtn(this)" data-pid="' + pId + '"><i class="fas fa-download" aria-hidden="true"></i>获取模型</button>'
      : '';

    return '<article class="pi ' + pStatusClass + '" data-id="' + pId + '">' +
      '<div class="ps" onclick="togBtn(this)" data-pid="' + pId + '" role="button" tabindex="0" onkeydown="togKey(event,this)" aria-controls="dt-' + pId + '">' +
        '<div class="l"><i class="fas fa-chevron-right provider-chevron" aria-hidden="true" id="ch-' + pId + '"></i><span class="provider-avatar" aria-hidden="true">' + escapeHtml((pName.charAt(0) || 'A').toUpperCase()) + '</span><div><h3>' + pName + '</h3><div class="pu"><code>' + pId + '</code><span>' + (isAnthropic ? 'Anthropic' : 'OpenAI') + '</span><span>' + keysArr.length + ' Keys</span><span>' + modelsArr.length + ' 模型</span>' + abnormalBadge + '</div></div></div>' +
        '<div class="fc fx-s0" onclick="event.stopPropagation()"><label class="tg"><input type="checkbox" ' + (isEnabled ? 'checked' : '') + ' id="en-' + pId + '" onchange="togglePbBtn(this)" data-pid="' + pId + '" aria-label="启用 ' + pName + '"><span class="sl"></span></label><span class="bd ' + (isEnabled ? 'bd-on' : 'bd-off') + '">' + (isEnabled ? '已启用' : '未启用') + '</span></div>' +
      '</div>' +
      '<div class="pd" id="dt-' + pId + '">' +
        '<div class="detail-heading"><div><h3>编辑 ' + pName + '</h3><p>修改暂存在内存中，点击顶部【统一保存】落盘写入 KV。</p></div><span class="protocol-chip">' + (isAnthropic ? 'ANTHROPIC' : 'OPENAI') + '</span></div>' +
        '<div class="fr"><div class="fg"><label>名称</label><input type="text" id="nm-' + pId + '" value="' + pName + '" oninput="markDirty(true)"></div><div class="fg"><label>ID</label><input type="text" value="' + pId + '" disabled></div></div>' +
        '<div class="fg"><label>API 地址</label><input type="url" id="url-' + pId + '" value="' + pUrl + '" oninput="markDirty(true)"></div>' +
        '<div class="fg"><label>API 格式</label><select id="at-' + pId + '" class="select-sm" onchange="markDirty(true)"><option value="openai" ' + (!isAnthropic ? 'selected' : '') + '>OpenAI 兼容</option><option value="anthropic" ' + (isAnthropic ? 'selected' : '') + '>Anthropic 兼容</option></select></div>' +
        '<fieldset class="form-group"><legend>上游 API Keys</legend><div id="keys-' + pId + '">' + keysHtml + '</div><div class="fc mt-1 field-row"><input type="text" id="nk-' + pId + '" placeholder="新的 API Key" class="fx1"><button class="btn btn-s btn-xs" onclick="addKeyRowBtn(this)" data-pid="' + pId + '"><i class="fas fa-plus" aria-hidden="true"></i>添加</button></div></fieldset>' +
        '<fieldset class="form-group"><legend>模型</legend>' + providerModelActions + '<div id="ml-' + pId + '">' + modelsHtml + '</div><div class="fc mt-1 field-row"><input type="text" id="nmid-' + pId + '" placeholder="新的模型 ID" class="fx1"><button class="btn btn-s btn-xs" onclick="addMdlBtn(this)" data-pid="' + pId + '"><i class="fas fa-plus" aria-hidden="true"></i>添加</button></div></fieldset>' +
        '<div class="detail-actions"><div id="tr-' + pId + '" aria-live="polite"></div><div>' + opencodeBtn + '<button class="btn btn-d" onclick="delBtn(this)" data-pid="' + pId + '"><i class="fas fa-trash" aria-hidden="true"></i>删除</button><button class="btn btn-p" onclick="saveBtn(this)" data-pid="' + pId + '"><i class="fas fa-save" aria-hidden="true"></i>暂存更改</button></div></div>' +
      '</div>' +
    '</article>';
  }).join('');
}

function renderProxyKeyList() {
  const container = document.querySelector('.key-list');
  if (!container) return;

  if (!draftProxyKeys || draftProxyKeys.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-key" aria-hidden="true"></i><h3>暂无转发 Key</h3><p>生成一个 Key 后，客户端才能访问网关。</p><button class="btn btn-p" onclick="genKey()">生成转发 Key</button></div>';
    return;
  }

  container.innerHTML = draftProxyKeys.map(function(k) {
    var kId = escapeHtml(k.id || '');
    var kVal = escapeHtml(k.key || '');
    var kName = escapeHtml(k.name || '');
    var isEnabled = k.enabled !== false;
    var masked = kVal.length > 12 ? kVal.substring(0, 8) + '*****' + kVal.substring(kVal.length - 4) : kVal;

    return '<article class="ki" data-id="' + kId + '">' +
      '<div class="key-main"><span class="key-icon" aria-hidden="true"><i class="fas fa-key"></i></span><div>' +
        '<div class="kv"><span id="kv-' + kId + '" data-full="' + kVal + '" data-vis="0">' + masked + '</span>' +
        '<button class="icon-btn" onclick="toggleKeyVisBtn(this)" data-id="' + kId + '" title="显示或隐藏" aria-label="显示或隐藏 Key"><i class="far fa-eye" aria-hidden="true"></i></button>' +
        '<button class="icon-btn" onclick="copyText(this)" data-copy="' + kVal + '" title="复制" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button></div>' +
        '<div class="key-meta"><h3>' + kName + '</h3><span class="key-meta__sep" aria-hidden="true">-</span><p>创建于 ' + (k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '未知') + ' · ' + (k.expiresAt ? '有效至 ' + new Date(k.expiresAt).toLocaleDateString() : '永久有效') + '</p></div>' +
      '</div></div>' +
      '<div class="key-actions"><label class="tg"><input type="checkbox" ' + (isEnabled ? 'checked' : '') + ' onchange="toggleProxyKeyBtn(this)" data-id="' + kId + '" aria-label="启用 ' + kName + '"><span class="sl"></span></label><span class="bd ' + (isEnabled ? 'bd-on' : 'bd-off') + '">' + (isEnabled ? '已启用' : '已禁用') + '</span><button class="bd bd-del" onclick="rmKeyBtn(this)" data-id="' + kId + '"><i class="fas fa-trash" aria-hidden="true"></i>删除</button></div>' +
    '</article>';
  }).join('');
}

const adminNavLinks = Array.from(document.querySelectorAll('.admin-nav a[href^="#"]'))
function setActiveAdminNav(hash) {
  const targetHash = adminNavLinks.some(function (link) { return link.getAttribute('href') === hash }) ? hash : '#overview'
  adminNavLinks.forEach(function (link) {
    const active = link.getAttribute('href') === targetHash
    link.classList.toggle('is-active', active)
    if (active) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
}
adminNavLinks.forEach(function (link) {
  link.addEventListener('click', function () { setActiveAdminNav(link.getAttribute('href') || '#overview') })
})
window.addEventListener('hashchange', function () { setActiveAdminNav(location.hash) })
setActiveAdminNav(location.hash)

// 网关日志及调试模式前端逻辑
var debugAutoRefreshTimer = null;

async function fetchLogs() {
  try {
    var res = await fetch('/admin/api/logs');
    var json = await res.json();
    if (json.success && json.data) {
      renderLogsTable(json.data.logs || []);
      var dbgToggle = document.getElementById('debug-mode-toggle');
      if (dbgToggle && typeof json.data.debugMode === 'boolean') {
        dbgToggle.checked = json.data.debugMode;
        setupAutoRefresh(json.data.debugMode);
      }
    }
  } catch (err) {
    console.error('获取请求日志失败:', err);
  }
}

function setupAutoRefresh(enabled) {
  if (debugAutoRefreshTimer) {
    clearInterval(debugAutoRefreshTimer);
    debugAutoRefreshTimer = null;
  }
  if (enabled) {
    debugAutoRefreshTimer = setInterval(function() {
      if (location.hash === '#logs' || !location.hash) {
        fetchLogs();
      }
    }, 3000);
  }
}

async function toggleDebugMode(checked) {
  try {
    var res = await fetch('/admin/api/debug-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debugMode: checked })
    });
    var json = await res.json();
    if (json.success) {
      toast(json.message, 'success');
      setupAutoRefresh(checked);
      fetchLogs();
    } else {
      toast(json.message || '切换调试模式失败', 'error');
    }
  } catch (err) {
    toast('切换调试模式请求异常', 'error');
  }
}

async function clearAllLogs() {
  if (!(await cM('确定要清空所有网关请求日志？'))) return;
  try {
    var res = await fetch('/admin/api/logs', { method: 'DELETE' });
    var json = await res.json();
    if (json.success) {
      toast(json.message || '网关请求日志已清空', 'success');
      fetchLogs();
    } else {
      toast(json.message || '清空日志失败', 'error');
    }
  } catch (err) {
    toast('清空日志请求失败', 'error');
  }
}

function renderLogsTable(logs) {
  var badge = document.getElementById('logs-count-badge');
  if (badge) badge.textContent = logs.length;

  var container = document.getElementById('logs-panel');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-list-alt" aria-hidden="true"></i><h3>暂无网关请求日志</h3><p>当客户端通过网关 <code>/v1</code> 接口发起调用时，请求日志将实时或批量显示在这里。</p></div>';
    return;
  }

  var rowsHtml = logs.map(function(item) {
    var isSuccess = item.status >= 200 && item.status < 300;
    var statusBadgeClass = isSuccess ? 'bd-on' : 'bd-off';
    var statusText = item.status || 500;
    var errText = item.error ? escapeHtml(item.error) : '-';
    var timeStr = escapeHtml(item.time || '-');
    var modelStr = escapeHtml(item.model || 'unknown');
    var latencyStr = (item.latency || 0) + ' ms';

    return '<tr>' +
      '<td style="padding:10px 12px;white-space:nowrap;font-size:var(--text-xs);color:var(--color-muted);">' + timeStr + '</td>' +
      '<td style="padding:10px 12px;"><code>' + modelStr + '</code></td>' +
      '<td style="padding:10px 12px;white-space:nowrap;"><span class="bd ' + statusBadgeClass + '">' + statusText + '</span></td>' +
      '<td style="padding:10px 12px;white-space:nowrap;font-family:var(--font-mono);font-size:var(--text-xs);">' + latencyStr + '</td>' +
      '<td style="padding:10px 12px;font-size:var(--text-xs);color:' + (isSuccess ? 'var(--color-muted)' : 'var(--color-danger)') + ';max-width:320px;word-break:break-all;">' + errText + '</td>' +
    '</tr>';
  }).join('');

  container.innerHTML = '<div class="table-wrap" style="overflow-x:auto;border:1px solid var(--color-rule);border-radius:var(--radius-panel);background:var(--color-paper);"><table class="data-table" style="width:100%;text-align:left;border-collapse:collapse;">' +
    '<thead><tr style="border-bottom:1px solid var(--color-rule);font-size:var(--text-xs);color:var(--color-muted);background:var(--color-paper-2);">' +
      '<th style="padding:10px 12px;">请求时间</th>' +
      '<th style="padding:10px 12px;">选中模型</th>' +
      '<th style="padding:10px 12px;">状态码</th>' +
      '<th style="padding:10px 12px;">响应耗时</th>' +
      '<th style="padding:10px 12px;">失败原因</th>' +
    '</tr></thead>' +
    '<tbody style="divide-y:1px solid var(--color-rule);">' + rowsHtml + '</tbody>' +
  '</table></div>';
}

// ===== 模型配套功能与探测任务客户端交互 =====

async function triggerProbe() {
  var btn = document.getElementById('btn-probe');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  toast('开始执行初始化与补位探测任务...', 'success');
  try {
    var res = await fetch('/admin/api/probe', { method: 'POST' });
    var data = await res.json();
    if (res.status === 429 || !data.success) {
      aM(data.message || '已有探测任务正在运行中，请稍后再试', 'error');
    } else {
      toast(data.message || '探测任务完成', 'success');
      var pRes = await fetch('/admin/api/providers');
      var pData = await pRes.json();
      if (pData.success && pData.data) {
        draftProviders = pData.data;
        renderProviderList();
      }
    }
  } catch (err) {
    aM('触发探测失败：' + ((err && err.message) || String(err)), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

async function resetCooldowns() {
  if (!(await cM('确定要重置全局所有处于冷却状态的模型？（注意：永久失效标记与失败计数器保持不变）'))) return;
  try {
    var res = await fetch('/admin/api/reset-cooldowns', { method: 'POST' });
    var data = await res.json();
    if (data.success) {
      toast(data.message || '已成功重置冷却模型', 'success');
      var pRes = await fetch('/admin/api/providers');
      var pData = await pRes.json();
      if (pData.success && pData.data) {
        draftProviders = pData.data;
        renderProviderList();
      }
    } else {
      aM('重置冷却失败：' + (data.message || '未知错误'), 'error');
    }
  } catch (err) {
    aM('请求网络异常：' + ((err && err.message) || String(err)), 'error');
  }
}

async function fetchUpstreamModels(providerId) {
  toast('正在拉取上游模型列表...', 'success');
  try {
    var res = await fetch('/admin/api/providers/' + encodeURIComponent(providerId) + '/fetch-models', { method: 'POST' });
    var data = await res.json();
    if (data.success && data.data && data.data.models) {
      var p = draftProviders.find(function(item) { return item.id === providerId; });
      if (p) {
        p.models = data.data.models;
        markDirty(true);
        renderProviderList();
        toast('一键拉取成功！已自动智能分类且去重，当前共 ' + data.data.models.length + ' 个模型', 'success');
      }
    } else {
      aM('拉取失败：' + (data.message || '未知错误'), 'error');
    }
  } catch (err) {
    aM('拉取上游模型异常：' + ((err && err.message) || String(err)), 'error');
  }
}

async function showImportModal(providerId) {
  var p = draftProviders.find(function(item) { return item.id === providerId; });
  if (!p) return;
  var text = await pM('导入模型 ID 列表（支持换行、逗号或分号分隔，自动剔除重复项并自动分类）：');
  if (!text) return;

  try {
    var res = await fetch('/admin/api/providers/' + encodeURIComponent(providerId) + '/import-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    var data = await res.json();
    if (data.success && data.data && data.data.models) {
      p.models = data.data.models;
      markDirty(true);
      renderProviderList();
      toast(data.message || '导入成功', 'success');
    } else {
      aM('导入失败：' + (data.message || '未知错误'), 'error');
    }
  } catch (err) {
    aM('导入模型网络异常：' + ((err && err.message) || String(err)), 'error');
  }
}

async function clearProviderModels(providerId) {
  if (!(await cM('确定要一键删除该提供商的全部模型？此操作不可逆！'))) return;
  try {
    var res = await fetch('/admin/api/providers/' + encodeURIComponent(providerId) + '/models', { method: 'DELETE' });
    var data = await res.json();
    if (data.success) {
      var p = draftProviders.find(function(item) { return item.id === providerId; });
      if (p) p.models = [];
      markDirty(true);
      renderProviderList();
      toast('已成功清空该提供商的全部模型', 'success');
    } else {
      aM('删除模型失败：' + (data.message || '未知错误'), 'error');
    }
  } catch (err) {
    aM('请求网络异常：' + ((err && err.message) || String(err)), 'error');
  }
}

async function unblockModel(providerId, modelId) {
  try {
    var res = await fetch('/admin/api/providers/' + encodeURIComponent(providerId) + '/models/' + encodeURIComponent(modelId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unblockPermanent: true })
    });
    var data = await res.json();
    if (data.success) {
      var p = draftProviders.find(function(item) { return item.id === providerId; });
      if (p) {
        var m = p.models.find(function(m) { return m.id === modelId; });
        if (m) {
          m.permanentlyDisabled = false;
          m.disabledReason = null;
          m.failureCount = 0;
          m.cooldownUntil = null;
        }
      }
      renderProviderList();
      toast('模型 [' + modelId + '] 已成功解封/重置！', 'success');
    } else {
      aM('解封失败：' + (data.message || '未知错误'), 'error');
    }
  } catch (err) {
    aM('请求异常：' + ((err && err.message) || String(err)), 'error');
  }
}

async function resetAllModelsInProvider(providerId) {
  var p = draftProviders.find(function(item) { return item.id === providerId; });
  if (!p || !p.models || !p.models.length) return;

  var abnormalModels = p.models.filter(function(m) {
    return m.permanentlyDisabled || (m.cooldownUntil && Date.now() < m.cooldownUntil) || (m.failureCount && m.failureCount > 0);
  });

  if (!abnormalModels.length) {
    toast('该提供商下无异常模型需重置', 'info');
    return;
  }

  try {
    toast('正在重置本提供商所有异常模型...', 'info');
    for (var i = 0; i < abnormalModels.length; i++) {
      var m = abnormalModels[i];
      await fetch('/admin/api/providers/' + encodeURIComponent(providerId) + '/models/' + encodeURIComponent(m.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unblockPermanent: true })
      });
      m.permanentlyDisabled = false;
      m.disabledReason = null;
      m.failureCount = 0;
      m.cooldownUntil = null;
    }
    renderProviderList();
    toast('已成功重置本提供商所有模型的异常状态！', 'success');
  } catch (err) {
    aM('重置部分模型状态异常：' + ((err && err.message) || String(err)), 'error');
  }
}

async function updateModelCat(providerId, modelId, category) {
  var p = draftProviders.find(function(item) { return item.id === providerId; });
  if (p) {
    var m = p.models.find(function(m) { return m.id === modelId; });
    if (m) {
      m.category = category;
      markDirty(true);
    }
  }
  try {
    await fetch('/admin/api/providers/' + encodeURIComponent(providerId) + '/models/' + encodeURIComponent(modelId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: category })
    });
    toast('已将模型分类修改为 [' + category + ']', 'success');
  } catch (err) {}
}

fetchLogs();
</script>
</body></html>`)
}