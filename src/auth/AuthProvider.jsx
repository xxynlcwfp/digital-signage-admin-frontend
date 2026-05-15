import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Spin } from 'antd'
import {
  bootstrapSession,
  clearSession,
  hasStoredSession,
  subscribeAuthState,
} from '../services/authService'

const AuthContext = createContext({
  ready: false,
  isAuthenticated: false,
  setAuthenticated: () => {},
  logout: () => {},
})

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasStoredSession())

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const result = await bootstrapSession()
      if (!cancelled) {
        setIsAuthenticated(result.authenticated)
        setReady(true)
      }
    })()

    const unsubscribe = subscribeAuthState((authenticated) => {
      if (!cancelled) {
        setIsAuthenticated(authenticated)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const setAuthenticated = useCallback((value) => {
    setIsAuthenticated(Boolean(value))
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setIsAuthenticated(false)
    window.location.assign('/login')
  }, [])

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f7fb',
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ ready, isAuthenticated, setAuthenticated, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
