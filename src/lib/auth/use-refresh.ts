'use client'

import { useEffect, useRef } from 'react'

/**
 * Silent token refresh hook.
 * Fires a refresh request 2 minutes before the access token expires (15min TTL → 13min).
 * Should be mounted once in a layout component that wraps authenticated pages.
 */
export function useSilentRefresh() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleRefresh(msUntilRefresh: number) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(doRefresh, msUntilRefresh)
  }

  async function doRefresh() {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        // Refresh token expired — redirect to login
        if (res.status === 401) {
          window.location.href = '/login'
        }
        return
      }
      // Re-schedule: access token valid for another 15min, refresh 2min early
      scheduleRefresh((15 - 2) * 60 * 1000)
    } catch {
      // Network error — retry in 30s
      scheduleRefresh(30 * 1000)
    }
  }

  useEffect(() => {
    // First refresh: 13 minutes after mount (access token has ~15min from last login/refresh)
    scheduleRefresh((15 - 2) * 60 * 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
