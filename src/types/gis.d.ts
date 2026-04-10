// Minimal type shim for Google Identity Services (GIS) token client.
export {}

declare global {
  namespace google.accounts.oauth2 {
    interface TokenResponse {
      access_token: string
      expires_in: number
      scope: string
      token_type: string
      error?: string
      error_description?: string
    }

    interface TokenClient {
      callback: (response: TokenResponse) => void
      requestAccessToken(overrideConfig?: { prompt?: '' | 'consent' | 'select_account' }): void
    }

    interface TokenClientConfig {
      client_id: string
      scope: string
      callback: (response: TokenResponse) => void
      prompt?: string
    }

    function initTokenClient(config: TokenClientConfig): TokenClient
    function revoke(accessToken: string, done: () => void): void
    function hasGrantedAnyScope(token: TokenResponse, ...scopes: string[]): boolean
  }
}
