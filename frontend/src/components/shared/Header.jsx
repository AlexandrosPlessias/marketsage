import { useState } from 'react'
import { fmtTokens } from '../../utils/fmt'

const NAV_PRIMARY = [
  { view: 'dashboard', label: 'Dashboard', icon: '📊' },
  { view: 'paper',     label: 'Trading',   icon: '📈' },
  { view: 'trending',  label: 'Discovery', icon: '🔥' },
  { view: 'explorer',  label: 'Explorer',  icon: '🔍' },
  { view: 'events',    label: 'Activity',  icon: '📋' },
  { view: 'reports',   label: 'Reports',   icon: '📑' },
  { view: 'education', label: 'Learn',     icon: '📚' },
  { view: 'schedule',  label: 'Schedule',  icon: '🗓' },
]
// Logs (Aspire) and Portainer only exist on the local Docker stack.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname)

const NAV_SECONDARY = [
  { view: 'backtest', label: 'Backtesting', icon: '🧪' },
  { view: 'settings', label: 'Settings',    icon: '⚙' },
]

// state: ok | idle | warn | err → dot colour; info chips (no state) show an icon instead.
// Colour is reserved for warn/err so a healthy bar reads as quiet.
function StatusChip({ state, icon, label, detail, title, onClick }) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`live-chip status-chip status-chip-${state ?? 'info'}`}
      title={title}
      onClick={onClick}
    >
      {state && <span className="status-dot" aria-hidden="true" />}
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{label}</span>
      {detail && <span className="status-chip-detail">· {detail}</span>}
    </Tag>
  )
}

export default function Header({ health, usage, btTodayTokens = 0, activeView, onViewChange, onOpenSettings, clock }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const navigate = (view) => { onViewChange(view); setMenuOpen(false) }
  const ok   = health?.status === 'ok'
  const open = health?.scheduler?.market_open

  // Countdown helper shared with the header market pill
  const fmtCountdown = (isoStr) => {
    if (!isoStr) return null
    const diffMs = new Date(isoStr) - Date.now()
    if (diffMs <= 0) return null
    const totalMin = Math.floor(diffMs / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  const closeIn = clock?.is_open  && clock?.next_close ? fmtCountdown(clock.next_close) : null
  const openIn  = !clock?.is_open && clock?.next_open  ? fmtCountdown(clock.next_open)  : null

  // Model label — provider + model from /health
  const provider  = health?.llm_provider ?? null
  const modelName = health?.llm_model    ?? health?.ollama_model ?? null
  const modelLabel = provider && provider !== 'ollama'
    ? `${provider} · ${modelName ?? '—'}`
    : (modelName ?? null)

  // Token label — filter to the active provider+model so the chip reflects
  // usage for the currently selected model only, not all providers combined.
  const today = new Date().toISOString().slice(0, 10)
  const activeProvider = usage?.active_provider ?? null
  const activeModel    = usage?.active_model    ?? null
  // by_model_day rows: { day, provider, model, prompt_tokens, completion_tokens }
  const modelTodayTokens = (() => {
    if (!usage?.by_model_day) {
      // fallback: use the combined by_day total
      return usage?.by_day?.find(d => d.date === today)?.total_tokens ?? 0
    }
    return (usage.by_model_day
      .filter(r =>
        r.day === today &&
        (!activeProvider || r.provider === activeProvider) &&
        (!activeModel    || r.model    === activeModel)
      )
      .reduce((s, r) => s + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0)
    )
  })()
  // by_model_day already includes backtest + signal + advisor + compare tokens
  // (the /usage endpoint UNIONs all sources). Do NOT add btTodayTokens here —
  // that would double-count backtest runs that are already in modelTodayTokens.
  const todayTokens = modelTodayTokens
  // For tooltip: all-providers combined today total
  const todayEntry = usage?.by_day?.find(d => d.date === today)

  return (
    <header className="header">

      {/* ── Row 1: logo · nav tabs · tools ─────────────────────────────────── */}
      <div className="header-row">
        <div className="header-left">
          <span className="logo">MarketSage</span>
          <nav className="header-nav">
            <button className={`nav-tab ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => onViewChange('dashboard')}>Dashboard</button>
            <button className={`nav-tab ${activeView === 'paper'     ? 'active' : ''}`} onClick={() => onViewChange('paper')}>Trading</button>
            <button className={`nav-tab ${activeView === 'trending'  ? 'active' : ''}`} onClick={() => onViewChange('trending')}>Discovery</button>
            <button className={`nav-tab ${activeView === 'explorer'  ? 'active' : ''}`} onClick={() => onViewChange('explorer')}>Explorer</button>
            <button className={`nav-tab ${activeView === 'events'    ? 'active' : ''}`} onClick={() => onViewChange('events')}>Activity</button>
            <button className={`nav-tab ${activeView === 'reports'   ? 'active' : ''}`} onClick={() => onViewChange('reports')}>Reports</button>
            <button className={`nav-tab ${activeView === 'education' ? 'active' : ''}`} onClick={() => onViewChange('education')}>Learn</button>
            <button className={`nav-tab ${activeView === 'schedule' ? 'active' : ''}`} onClick={() => onViewChange('schedule')}>Schedule</button>
          </nav>
        </div>
        <div className="header-right">
          <div className="header-tools">
            <button className={`nav-tab ${activeView === 'backtest' ? 'active' : ''}`} onClick={() => onViewChange('backtest')} style={{ fontSize: 12 }}>Backtesting</button>
            {IS_LOCAL && <a href="http://localhost:18889" target="_blank" rel="noreferrer" className="tool-btn" title="Aspire — traces & logs">Logs</a>}
            {IS_LOCAL && <a href="http://localhost:9000"  target="_blank" rel="noreferrer" className="tool-btn" title="Portainer — container management">Portainer</a>}
            <button
              className={`tool-btn ${activeView === 'settings' ? 'tool-btn-active' : ''}`}
              onClick={() => onViewChange('settings')}
              title="Settings"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '3px 8px' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.34.07-.69.07-1.08s-.03-.74-.07-1.08l2.33-1.82c.21-.17.27-.46.14-.7l-2.2-3.82c-.14-.24-.42-.32-.66-.24l-2.74 1.1c-.57-.44-1.18-.8-1.84-1.08l-.42-2.9c-.04-.26-.27-.46-.54-.46H9.5c-.27 0-.5.2-.54.46l-.42 2.9c-.66.28-1.27.64-1.84 1.08l-2.74-1.1c-.24-.08-.52 0-.66.24l-2.2 3.82c-.14.24-.07.53.14.7L3.57 10c-.04.34-.07.69-.07 1.08s.03.74.07 1.08L1.24 13.98c-.21.17-.27.46-.14.7l2.2 3.82c.14.24.42.32.66.24l2.74-1.1c.57.44 1.18.8 1.84 1.08l.42 2.9c.04.26.27.46.54.46h4.4c.27 0 .5-.2.54-.46l.42-2.9c.66-.28 1.27-.64 1.84-1.08l2.74 1.1c.24.08.52 0 .66-.24l2.2-3.82c.14-.24.07-.53-.14-.7l-2.33-1.9z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Hamburger — mobile only ────────────────────────────────────────── */}
        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen
            ? /* ✕ close */ <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            : /* ☰ menu */ <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="3" y1="6"  x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          }
        </button>
      </div>

      {/* ── Mobile nav drawer ──────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="mobile-menu-backdrop" onClick={() => setMenuOpen(false)}>
          <nav className="mobile-menu-drawer" onClick={e => e.stopPropagation()}>

            <div className="mobile-menu-section-label">Navigation</div>
            {NAV_PRIMARY.map(({ view, label, icon }) => (
              <button
                key={view}
                className={`mobile-menu-item ${activeView === view ? 'active' : ''}`}
                onClick={() => navigate(view)}
              >
                <span className="mobile-menu-icon">{icon}</span>
                {label}
                {activeView === view && <span className="mobile-menu-active-dot" />}
              </button>
            ))}

            <div className="mobile-menu-divider" />
            <div className="mobile-menu-section-label">Tools</div>
            {NAV_SECONDARY.map(({ view, label, icon }) => (
              <button
                key={view}
                className={`mobile-menu-item ${activeView === view ? 'active' : ''}`}
                onClick={() => navigate(view)}
              >
                <span className="mobile-menu-icon">{icon}</span>
                {label}
                {activeView === view && <span className="mobile-menu-active-dot" />}
              </button>
            ))}

            {IS_LOCAL && (
              <>
                <div className="mobile-menu-divider" />
                <div className="mobile-menu-section-label">External</div>
                <a href="http://localhost:18889" target="_blank" rel="noreferrer" className="mobile-menu-item" onClick={() => setMenuOpen(false)}>
                  <span className="mobile-menu-icon">📋</span>Logs
                </a>
                <a href="http://localhost:9000" target="_blank" rel="noreferrer" className="mobile-menu-item" onClick={() => setMenuOpen(false)}>
                  <span className="mobile-menu-icon">🐳</span>Portainer
                </a>
              </>
            )}

          </nav>
        </div>
      )}

      {/* ── Row 2: status bar — Market · Engine · AI ───────────────────────── */}
      <div className="header-statusbar">
        {!health && (
          <span className="live-chip live-chip-connecting">connecting…</span>
        )}

        {health && (() => {
          const sched = health.scheduler ?? {}
          const at    = health.autotrade ?? {}
          const hhmm  = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null

          // Engine
          const running  = sched.running ?? false
          const lastRun  = hhmm(sched.last_run)
          const nextRun  = hhmm(sched.next_run)
          const interval = sched.scan_interval_minutes ?? null
          const lastDisc = hhmm(sched.last_discovery)
          const nextDisc = hhmm(sched.next_discovery)
          const discOn   = !!(sched.next_discovery || sched.last_discovery)
          const paper    = at.paper ?? false
          const frac     = at.frac ?? false
          const fracLive = frac && at.frac_mode === 'live'
          const autoParts = [paper && 'Bracket', frac && (fracLive ? 'Frac LIVE' : 'Frac')].filter(Boolean)

          return (
            <>
              {/* ── Market ── */}
              <div className="statusbar-group">
                <StatusChip
                  state={ok ? 'ok' : 'err'}
                  label="System"
                  title={ok ? 'Backend services are healthy' : 'Backend service error — check logs'}
                />
                <StatusChip
                  state={open ? 'ok' : 'idle'}
                  label={open ? 'Market open' : 'Market closed'}
                  detail={open ? closeIn : openIn}
                  title={open
                    ? (closeIn ? `US market open — closes in ${closeIn}` : 'US equity market is open')
                    : (openIn  ? `US market closed — opens in ${openIn}` : 'US equity market is closed')}
                  onClick={() => onViewChange('schedule')}
                />
              </div>

              <span className="statusbar-sep" aria-hidden="true">|</span>

              {/* ── Engine ── */}
              <div className="statusbar-group">
                <StatusChip
                  state={running ? 'ok' : (open ? 'err' : 'idle')}
                  icon="📡"
                  label={running ? 'Scanner' : 'Scanner off'}
                  detail={running && nextRun ? `next ${nextRun}` : null}
                  title={[
                    running ? 'Signal scanner active' : 'Signal scanner stopped',
                    interval ? `Interval: ${interval} min` : null,
                    lastRun ? `Last scan: ${lastRun}` : null,
                    nextRun ? `Next scan: ${nextRun}` : null,
                  ].filter(Boolean).join('\n')}
                  onClick={() => onViewChange('schedule')}
                />
                <StatusChip
                  state={fracLive ? 'warn' : (autoParts.length ? 'ok' : 'idle')}
                  icon="🤖"
                  label={autoParts.length ? `Auto: ${autoParts.join(' + ')}` : 'Auto off'}
                  title={[
                    'Autonomous trading',
                    `Paper bracket auto-trade: ${paper ? 'on' : 'off'}`,
                    `Fractional auto-trade: ${frac ? `on (${at.frac_mode})` : 'off'}`,
                    fracLive ? '⚠ Fractional is trading REAL money' : null,
                  ].filter(Boolean).join('\n')}
                  onClick={() => onOpenSettings?.('settings-autotrade')}
                />
                <StatusChip
                  state={discOn ? 'ok' : 'idle'}
                  icon="🔥"
                  label={discOn ? 'Discovery' : 'Discovery off'}
                  detail={nextDisc ? `next ${nextDisc}` : (lastDisc ? `last ${lastDisc}` : null)}
                  title={[
                    discOn ? 'Trending discovery scheduled' : 'Discovery not scheduled',
                    lastDisc ? `Last run: ${lastDisc}` : 'No run yet',
                    nextDisc ? `Next run: ${nextDisc}` : null,
                  ].filter(Boolean).join('\n')}
                  onClick={() => onViewChange('trending')}
                />
                <StatusChip
                  icon="📋"
                  label={`${health.watchlist_size ?? 0} tickers`}
                  title={`Watchlist: ${health.watchlist_size ?? 0} ticker(s) being monitored`}
                  onClick={() => onViewChange('dashboard')}
                />
              </div>

              {/* ── AI (right-aligned) ── */}
              <div className="statusbar-group statusbar-group-end">
                {modelLabel && (
                  <StatusChip
                    icon="🧠"
                    label={modelLabel}
                    title={`Active LLM: ${modelLabel}`}
                    onClick={() => onOpenSettings?.('settings-ai-provider')}
                  />
                )}
                {usage && (
                  <StatusChip
                    icon="⚡"
                    label={`${fmtTokens(todayTokens)} tokens today`}
                    title={[
                      `Tokens today (${activeModel ? activeModel.split('/').pop() : 'all models'}): ${todayTokens.toLocaleString()}`,
                      `  analysis: ${fmtTokens(modelTodayTokens)}  backtests: ${fmtTokens(btTodayTokens)}`,
                      `All providers today: ${fmtTokens(todayEntry?.total_tokens ?? 0)}`,
                      `All-time (${usage?.period_days ?? 30}d): ${fmtTokens(usage?.total_prompt_tokens ?? 0)} prompt + ${fmtTokens(usage?.total_completion_tokens ?? 0)} completion`,
                    ].join('\n')}
                    onClick={() => onOpenSettings?.('settings-usage')}
                  />
                )}
              </div>
            </>
          )
        })()}
      </div>

    </header>
  )
}
