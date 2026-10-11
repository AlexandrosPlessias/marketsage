import { useState, useEffect, useCallback } from 'react'
import { API, getAuthHeaders, signal401 } from '../utils/api'

export function usePolling(path, intervalMs = 0) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(API + path, { headers: getAuthHeaders() })
      // Only force re-login if we actually had a token — prevents stale pre-login
      // requests from wiping a token the user set while the request was in-flight.
      if (res.status === 401) { if (sessionStorage.getItem('admin_token')) signal401(); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [path])

  useEffect(() => {
    load()
    // Polls start before the login screen is submitted; refetch as soon as a token
    // exists instead of waiting a full interval (60 s for /usage and /watchlist).
    window.addEventListener('auth-login', load)
    const id = intervalMs ? setInterval(load, intervalMs) : null
    return () => { window.removeEventListener('auth-login', load); if (id) clearInterval(id) }
  }, [load, intervalMs])

  return { data, error, reload: load }
}
