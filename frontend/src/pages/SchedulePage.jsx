import { useState, useEffect } from 'react'
import { API, getAuthHeaders } from '../utils/api'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const DISPLAY_TZ = 'Europe/Athens'

function fmtLocal(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function fmtUTC(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date) + ' UTC'
}

function parseHHMM(hhmm, date, tz) {
  const [h, m] = hhmm.split(':').map(Number)
  const str = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
  const utcOffset = getUTCOffsetMinutes(tz, date)
  return new Date(new Date(str + 'Z').getTime() - utcOffset * 60000)
}

function getUTCOffsetMinutes(tz, date) {
  const utcStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'shortOffset' }).format(date)
  const match = utcStr.match(/GMT([+-]\d+(?::\d+)?)/)
  if (!match) return 0
  const parts = match[1].split(':')
  const h = parseInt(parts[0], 10)
  const m = parts[1] ? parseInt(parts[1], 10) : 0
  return h * 60 + (h < 0 ? -m : m)
}

// Athens is GMT+2 in winter and GMT+3 on summer time — derive the label rather than
// hardcoding it, so it can never disagree with the times rendered beside it.
function fmtTZLabel(tz, date) {
  const mins = getUTCOffsetMinutes(tz, date)
  const sign = mins < 0 ? '-' : '+'
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.abs(mins) % 60
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

function getMondayOfWeek(now) {
  const d = new Date(now)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// The evening cron jobs run at fixed UTC times (infra/cron-worker/wrangler.toml), so in
// winter they land an hour earlier in ET than in summer — derive them from UTC, not the close.
function utcOnTradingDay(openTime, hh, mm) {
  return new Date(Date.UTC(openTime.getUTCFullYear(), openTime.getUTCMonth(), openTime.getUTCDate(), hh, mm))
}

function buildEvents(dayDate, marketHours, scanIntervalMinutes, discoveryIntervalMinutes) {
  const tz = marketHours.timezone || 'America/New_York'
  const openTime = parseHHMM(marketHours.open, dayDate, tz)
  const closeTime = parseHHMM(marketHours.close, dayDate, tz)
  const isMonday = dayDate.getDay() === 1
  const isFriday = dayDate.getDay() === 5

  const events = []

  const wakeTime = new Date(openTime.getTime() - 60 * 60000)
  events.push({ time: wakeTime, label: 'System wake (Fly + Vercel)', color: '#6b7280' })

  // Always reserve one row for the Monday purge so all columns have the same
  // event structure and thus the same row heights → perfect cross-column alignment.
  const purgeTime = new Date(wakeTime.getTime() + 5 * 60000)
  events.push(isMonday
    ? { time: purgeTime, label: 'Watchlist purge (untradable)', color: '#fb923c' }
    : { time: purgeTime, label: '', color: 'transparent', spacer: true })

  events.push({ time: openTime, label: 'Market opens', color: '#22c55e' })

  const scanMs = (scanIntervalMinutes || 15) * 60000
  let t = new Date(openTime.getTime())
  while (t <= closeTime) {
    events.push({ time: new Date(t), label: 'Signal scan', color: '#60a5fa' })
    t = new Date(t.getTime() + scanMs)
  }

  // Always show discovery — planning view; interval matters more than toggle state.
  const discMs = (discoveryIntervalMinutes || 60) * 60000
  let discCursor = new Date(openTime)
  discCursor.setMinutes(0, 0, 0)
  if (discCursor < openTime) discCursor = new Date(discCursor.getTime() + discMs)
  while (discCursor < closeTime) {
    events.push({ time: new Date(discCursor), label: 'Discovery run', color: '#a78bfa' })
    discCursor = new Date(discCursor.getTime() + discMs)
  }

  events.push({ time: closeTime, label: 'Market closes', color: '#ef4444' })

  const eodTime = utcOnTradingDay(openTime, 21, 5)
  events.push({ time: eodTime, label: 'EOD report', color: '#f97316' })

  // Same pattern: always reserve one row for the Friday EoW report.
  const eowTime = utcOnTradingDay(openTime, 21, 25)
  events.push(isFriday
    ? { time: eowTime, label: 'End-of-Week report', color: '#e879f9' }
    : { time: eowTime, label: '', color: 'transparent', spacer: true })

  const stopTime = utcOnTradingDay(openTime, 21, 30)
  events.push({ time: stopTime, label: 'System stop (Fly + Vercel)', color: '#6b7280' })

  events.sort((a, b) => {
    if (!a.time || !b.time) return 0
    return a.time - b.time
  })

  return events
}

function isMarketOpen(now, marketHours) {
  if (!marketHours) return false
  const tz = marketHours.timezone || 'America/New_York'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const dayStr = parts.find(p => p.type === 'weekday')?.value
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
  const dayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  const dayIdx = dayMap[dayStr] ?? -1
  const tradingDays = marketHours.trading_days || [0, 1, 2, 3, 4]
  if (!tradingDays.includes(dayIdx)) return false
  const [oh, om] = (marketHours.open || '09:30').split(':').map(Number)
  const [ch, cm] = (marketHours.close || '16:00').split(':').map(Number)
  const nowMin = hour * 60 + minute
  return nowMin >= oh * 60 + om && nowMin < ch * 60 + cm
}

function timeAgo(iso) {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const timeStr = fmtLocal(new Date(iso))
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago (${timeStr})`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago (${timeStr})`
  return `${Math.floor(diff / 3600000)}h ago (${timeStr})`
}

function timeUntil(iso) {
  if (!iso) return 'unknown'
  const diff = new Date(iso).getTime() - Date.now()
  const timeStr = fmtLocal(new Date(iso))
  if (diff <= 0) return `now (${timeStr})`
  if (diff < 60000) return `in ${Math.floor(diff / 1000)}s (${timeStr})`
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)}m (${timeStr})`
  return `in ${Math.floor(diff / 3600000)}h (${timeStr})`
}

export default function SchedulePage() {
  const [settings, setSettings] = useState(null)
  const [health, setHealth] = useState(null)
  const [discovery, setDiscovery] = useState(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    fetch(`${API}/settings`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSettings(d))
      .catch(() => {})
    fetch(`${API}/health`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setHealth(d))
      .catch(() => {})
    fetch(`${API}/settings/discovery`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDiscovery(d))
      .catch(() => {})
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  const marketHours = settings?.market_hours
  const scanIntervalMinutes = settings?.scan_interval_minutes || 15
  const discoveryEnabled = discovery?.enabled ?? false
  const discoveryIntervalMinutes = discovery?.interval_minutes || 60
  const tz = marketHours?.timezone || 'America/New_York'

  const monday = getMondayOfWeek(now)
  const weekDays = DAY_NAMES.map((name, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const todayET = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'long',
  }).format(now)
  const todayColIdx = DAY_NAMES.findIndex(n => n === todayET)
  const marketOpen = isMarketOpen(now, marketHours)

  const schedulerRunning = health?.scheduler?.running ?? false
  const lastRun = health?.scheduler?.last_run
  const nextRun = health?.scheduler?.next_run

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '0 8px' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Weekly Schedule</h1>
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>
          Times shown in {fmtTZLabel(DISPLAY_TZ, new Date())} (Athens) · hover for UTC
        </span>
      </div>

      {!marketHours && (
        <div style={{ color: 'var(--dim)', fontSize: 13, padding: 24 }}>Loading schedule…</div>
      )}

      {marketHours && (() => {
        // Build + merge events per day (skip spacers — table layout handles alignment)
        // Row key = UTC time-of-day (not absolute timestamp), so the same slot on
        // different dates shares one row. All events fall within one UTC day.
        const tod = t => t.getUTCHours() * 60 + t.getUTCMinutes()
        const mergeEvents = evs => evs
          .filter(ev => ev.time && !ev.spacer)
          .sort((a, b) => a.time - b.time)
          .reduce((acc, ev) => {
            const mk = tod(ev.time)
            const prev = acc[acc.length - 1]
            if (prev && prev.minuteKey === mk) {
              prev.labels = [...prev.labels, { text: ev.label, color: ev.color }]
            } else {
              acc.push({ time: ev.time, minuteKey: mk, labels: [{ text: ev.label, color: ev.color }] })
            }
            return acc
          }, [])

        const allDayMerged = weekDays.map(d =>
          mergeEvents(buildEvents(d, marketHours, scanIntervalMinutes, discoveryIntervalMinutes))
        )

        // Union of all minute-keys → sorted time rows
        const allMinutes = [...new Set(allDayMerged.flatMap(d => d.map(ev => ev.minuteKey)))].sort((a, b) => a - b)

        // Insert the "now" marker only when today is shown in this week view
        const nowMinute = tod(now)
        const timeLabel = {}
        allDayMerged.forEach(d => d.forEach(ev => { timeLabel[ev.minuteKey] ??= ev.time }))
        const showNow = todayColIdx >= 0 && todayColIdx <= 4
        const timeRows = []
        let nowInserted = false
        for (const mk of allMinutes) {
          if (showNow && !nowInserted && mk > nowMinute) {
            timeRows.push({ isNow: true })
            nowInserted = true
          }
          timeRows.push({ minuteKey: mk })
        }
        if (showNow && !nowInserted) timeRows.push({ isNow: true })

        const cellBorder = '1px solid color-mix(in srgb, var(--border) 40%, transparent)'

        return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 46, padding: '6px 8px', textAlign: 'right', color: 'var(--dim)', fontWeight: 500, fontSize: 10, borderBottom: '1px solid var(--border)' }}>
                    Time
                  </th>
                  {weekDays.map((d, i) => {
                    const isToday = i === todayColIdx
                    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    return (
                      <th key={i} style={{
                        padding: '6px 10px',
                        textAlign: 'left',
                        fontWeight: 700,
                        fontSize: 12,
                        color: isToday ? 'var(--accent)' : 'var(--text)',
                        borderBottom: `2px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                        background: isToday ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                      }}>
                        {DAY_NAMES[i]}
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: 'var(--dim)' }}>{dateLabel}</span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {timeRows.map((row, ri) => {
                  if (row.isNow) {
                    return (
                      <tr key="now">
                        <td colSpan={6} style={{ padding: 0, height: 2, background: '#ef4444' }} />
                      </tr>
                    )
                  }
                  const { minuteKey } = row
                  const representativeTime = timeLabel[minuteKey]
                  return (
                    <tr key={minuteKey} style={{ borderBottom: cellBorder }}>
                      <td style={{
                        padding: '4px 8px',
                        textAlign: 'right',
                        color: 'var(--dim)',
                        fontFamily: 'monospace',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 10,
                        whiteSpace: 'nowrap',
                        verticalAlign: 'middle',
                        borderRight: cellBorder,
                      }}
                        title={fmtUTC(representativeTime)}
                      >
                        {fmtLocal(representativeTime)}
                      </td>
                      {allDayMerged.map((dayEvs, di) => {
                        const isToday = di === todayColIdx
                        const ev = dayEvs.find(e => e.minuteKey === minuteKey)
                        return (
                          <td key={di} style={{
                            padding: '4px 10px',
                            verticalAlign: 'middle',
                            background: isToday ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'transparent',
                          }}>
                            {ev && ev.labels.map((lbl, li) => (
                              <span key={li} style={{ display: li > 0 ? 'block' : 'inline-block', color: lbl.color, whiteSpace: 'nowrap' }}>
                                {li > 0 && <span style={{ color: 'var(--dim)', fontSize: 9 }}>· </span>}
                                {lbl.text}
                              </span>
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}

      <div style={{
        marginTop: 20,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        padding: '10px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        fontSize: 12,
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text)', marginRight: 4 }}>Live status</span>

        <span style={{
          padding: '2px 8px', borderRadius: 20,
          background: schedulerRunning ? '#0f2d1a' : '#2d0f0f',
          color: schedulerRunning ? '#22c55e' : '#ef4444',
          fontWeight: 600,
        }}>
          Scheduler: {schedulerRunning ? 'running' : 'stopped'}
        </span>

        <span style={{
          padding: '2px 8px', borderRadius: 20,
          background: marketOpen ? '#0f2d1a' : '#2d0f0f',
          color: marketOpen ? '#22c55e' : '#ef4444',
          fontWeight: 600,
        }}>
          Market: {marketOpen ? 'open' : 'closed'}
        </span>

        <span style={{ color: 'var(--dim)' }}>
          Last scan: <span style={{ color: 'var(--text)' }}>{timeAgo(lastRun)}</span>
        </span>

        <span style={{ color: 'var(--dim)' }}>
          Next scan: <span style={{ color: 'var(--text)' }}>{timeUntil(nextRun)}</span>
        </span>

        {marketHours && (
          <span style={{ color: 'var(--dim)', marginLeft: 'auto' }}>
            Market {marketHours.open}–{marketHours.close} {marketHours.timezone} · scan every {scanIntervalMinutes}m
          </span>
        )}
      </div>
    </div>
  )
}
