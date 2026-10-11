import { useState, useEffect } from 'react'
import PaperTradingPage from './PaperTradingPage'
import FracTradingPage from './FracTradingPage'
import { API, getAuthHeaders } from '../utils/api'

const money = (v, dp = 2) =>
  v == null ? '—' : `${v >= 0 ? '' : '-'}$${Math.abs(Number(v)).toFixed(dp)}`
const pnlColor = v => (v > 0 ? '#34d399' : v < 0 ? '#f87171' : 'var(--dim)')
const pct = v => (v == null ? '—' : `${v.toFixed(1)}%`)

function Tile({ label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '10px 14px', minWidth: 120,
    }}>
      <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function EcoBlock({ title, eco, color }) {
  if (!eco) return null
  const wr = eco.win_rate != null ? `${eco.win_rate.toFixed(0)}%` : '—'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Tile label="Realised P&L" value={money(eco.total_pnl)} color={pnlColor(eco.total_pnl)} />
        <Tile label="Closed trades" value={eco.closed_trades ?? 0} />
        <Tile label="Win rate" value={wr} sub={`${eco.wins ?? 0}W / ${eco.losses ?? 0}L`} />
        <Tile label="Best run" value={money(eco.win_pnl)} color="#34d399" />
        <Tile label="Worst run" value={money(eco.loss_pnl)} color="#f87171" />
        {eco.open_positions > 0 && (
          <Tile label="Open positions" value={eco.open_positions} sub={`~${money(eco.notional_open, 0)} at risk`} />
        )}
      </div>
    </div>
  )
}

function EarningsTab() {
  const [eco, setEco] = useState(null)
  const [orderAcct, setOrderAcct] = useState(null)
  const [fracAcct, setFracAcct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`${API}/reports/economics`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/paper/account`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/frac/account`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : null),
    ])
      .then(([ecoData, ordData, fracData]) => {
        setEco(ecoData)
        setOrderAcct(ordData?.account ?? null)
        setFracAcct(fracData?.account ?? null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--dim)', padding: 24 }}>Loading earnings…</div>
  if (error)   return <div style={{ color: '#f87171', padding: 24 }}>Error: {error}</div>

  const ordDayPnl  = orderAcct?.day_pnl  != null ? Number(orderAcct.day_pnl)  : null
  const ordDayPct  = orderAcct?.day_pnl_pct != null ? Number(orderAcct.day_pnl_pct) * 100 : null
  const fracDayPnl = fracAcct?.day_pnl   != null ? Number(fracAcct.day_pnl)   : null
  const combinedDayPnl = ordDayPnl != null || fracDayPnl != null
    ? (ordDayPnl ?? 0) + (fracDayPnl ?? 0) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Today ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>📅 Today</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Tile
            label="Orders — day P&L"
            value={money(ordDayPnl)}
            color={ordDayPnl != null ? pnlColor(ordDayPnl) : undefined}
            sub={ordDayPct != null ? `${ordDayPct >= 0 ? '+' : ''}${ordDayPct.toFixed(2)}%` : undefined}
          />
          <Tile
            label="Frac — day P&L"
            value={money(fracDayPnl)}
            color={fracDayPnl != null ? pnlColor(fracDayPnl) : undefined}
          />
          <Tile
            label="Combined — day P&L"
            value={money(combinedDayPnl)}
            color={combinedDayPnl != null ? pnlColor(combinedDayPnl) : undefined}
          />
          {orderAcct?.equity != null && (
            <Tile label="Orders equity" value={money(orderAcct.equity)} />
          )}
          {fracAcct?.equity != null && (
            <Tile label="Frac equity" value={money(fracAcct.equity)} />
          )}
        </div>
      </div>

      {/* ── All-time ── */}
      <EcoBlock title="📈 Order Trading — all-time" eco={eco?.orders} color="#60a5fa" />
      <EcoBlock title="🪙 Fractional Trading — all-time" eco={eco?.frac} color="#a78bfa" />

      {eco?.combined && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>⚡ Combined — all-time</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Tile
              label="Total realised P&L"
              value={money(eco.combined.total_pnl)}
              color={pnlColor(eco.combined.total_pnl)}
            />
            <Tile label="Closed trades" value={eco.combined.closed_trades ?? 0} />
            <Tile
              label="Win rate"
              value={eco.combined.win_rate != null ? `${eco.combined.win_rate.toFixed(0)}%` : '—'}
              sub={`${eco.combined.wins ?? 0}W / ${eco.combined.losses ?? 0}L`}
            />
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--dim)' }}>
        ⓘ Alpaca paper accounts charge $0 commission — all P&L figures are net of fees.
      </div>
    </div>
  )
}

// Unified Trading page — three tabs:
//   • Order Trading      — whole-share bracket orders on the primary paper account
//   • Fractional Trading — notional buys on the 2nd (frac) Alpaca profile
//   • Earnings           — consolidated all-time + today P&L across both accounts
export default function TradingPage({ initialExpandedOrder, onExpandedOrderConsumed, onOpenExplorer }) {
  const [tab, setTab] = useState('order')

  // A sidebar order deep-link targets the Order Trading tab.
  useEffect(() => { if (initialExpandedOrder) setTab('order') }, [initialExpandedOrder])

  const tabStyle = active => ({
    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    marginBottom: -2,
  })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px 0' }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', paddingBottom: 0, marginBottom: 20 }}>
        <button className={`nav-tab ${tab === 'order' ? 'active' : ''}`} onClick={() => setTab('order')} style={tabStyle(tab === 'order')}>
          📈 Order Trading
        </button>
        <button className={`nav-tab ${tab === 'frac' ? 'active' : ''}`} onClick={() => setTab('frac')} style={tabStyle(tab === 'frac')}>
          🪙 Fractional Trading
        </button>
        <button className={`nav-tab ${tab === 'earnings' ? 'active' : ''}`} onClick={() => setTab('earnings')} style={tabStyle(tab === 'earnings')}>
          💰 Earnings
        </button>
      </div>

      {/* Keep Order + Frac mounted so polling state survives tab switches. */}
      <div style={{ display: tab === 'order' ? '' : 'none' }}>
        <PaperTradingPage
          initialExpandedOrder={initialExpandedOrder}
          onExpandedOrderConsumed={onExpandedOrderConsumed}
          onOpenExplorer={onOpenExplorer}
        />
      </div>
      <div style={{ display: tab === 'frac' ? '' : 'none' }}>
        <FracTradingPage onOpenExplorer={onOpenExplorer} />
      </div>
      {tab === 'earnings' && <EarningsTab />}
    </div>
  )
}
