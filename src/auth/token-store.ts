import { idbGet, idbSet, idbDelete, STORE_TOKEN } from '../utils/idb'

export interface StoredAuthState {
  accessToken: string
  expiresAt: number
  userInfo: { name: string; email: string; picture: string }
}

const KEY = 'current'

export async function getStoredToken(): Promise<StoredAuthState | null> {
  const value = await idbGet<StoredAuthState>(STORE_TOKEN, KEY)
  return value ?? null
}

export async function persistToken(state: StoredAuthState): Promise<void> {
  await idbSet(STORE_TOKEN, state, KEY)
}

export async function clearToken(): Promise<void> {
  await idbDelete(STORE_TOKEN, KEY)
}
