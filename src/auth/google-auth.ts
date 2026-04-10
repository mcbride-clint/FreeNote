import { clearToken, getStoredToken, persistToken, StoredAuthState } from './token-store'

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ')

export type AuthState = StoredAuthState

export class GoogleAuth {
  private tokenClient: google.accounts.oauth2.TokenClient | null = null
  private ready: Promise<void> | null = null

  async initialize(clientId: string): Promise<void> {
    this.ready = this.waitForGis().then(() => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: () => {}
      })
    })
    await this.ready
  }

  private waitForGis(): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const check = () => {
        if (typeof google !== 'undefined' && google.accounts?.oauth2) {
          resolve()
          return
        }
        if (Date.now() - start > 10_000) {
          reject(new Error('Google Identity Services script failed to load'))
          return
        }
        setTimeout(check, 50)
      }
      check()
    })
  }

  async signIn(): Promise<AuthState> {
    await this.ready
    if (!this.tokenClient) throw new Error('Auth not initialized')
    return new Promise((resolve, reject) => {
      this.tokenClient!.callback = async (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error))
          return
        }
        try {
          const userInfo = await this.fetchUserInfo(response.access_token)
          const state: AuthState = {
            accessToken: response.access_token,
            expiresAt: Date.now() + response.expires_in * 1000,
            userInfo
          }
          await persistToken(state)
          resolve(state)
        } catch (err) {
          reject(err)
        }
      }
      this.tokenClient!.requestAccessToken({ prompt: 'consent' })
    })
  }

  async signOut(): Promise<void> {
    const token = await getStoredToken()
    if (token && typeof google !== 'undefined') {
      try {
        google.accounts.oauth2.revoke(token.accessToken, () => {})
      } catch { /* ignore */ }
    }
    await clearToken()
  }

  async getStored(): Promise<AuthState | null> {
    return getStoredToken()
  }

  async getValidToken(): Promise<string | null> {
    const stored = await getStoredToken()
    if (!stored) return null
    if (Date.now() < stored.expiresAt - 60_000) return stored.accessToken
    return this.refreshSilent(stored)
  }

  private async refreshSilent(stored: AuthState): Promise<string | null> {
    await this.ready
    if (!this.tokenClient) return null
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000)
      this.tokenClient!.callback = async (response) => {
        clearTimeout(timeout)
        if (response.error) {
          resolve(null)
          return
        }
        const refreshed: AuthState = {
          ...stored,
          accessToken: response.access_token,
          expiresAt: Date.now() + response.expires_in * 1000
        }
        await persistToken(refreshed)
        resolve(response.access_token)
      }
      try {
        this.tokenClient!.requestAccessToken({ prompt: '' })
      } catch {
        clearTimeout(timeout)
        resolve(null)
      }
    })
  }

  private async fetchUserInfo(token: string) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('Failed to fetch user info')
    const data = await res.json()
    return {
      name: data.name ?? data.email ?? 'User',
      email: data.email ?? '',
      picture: data.picture ?? ''
    }
  }
}

export const googleAuth = new GoogleAuth()
