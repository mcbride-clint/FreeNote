import { idbDelete, idbGet, idbGetAll, idbSet, STORE_NOTES } from '../utils/idb'

export interface CachedNote {
  id: string
  name: string
  content: string
  driveModifiedTime: string
  localModifiedAt: number
  dirty: boolean
}

export async function getCached(id: string): Promise<CachedNote | undefined> {
  return idbGet<CachedNote>(STORE_NOTES, id)
}

export async function putCached(note: CachedNote): Promise<void> {
  await idbSet(STORE_NOTES, note)
}

export async function deleteCached(id: string): Promise<void> {
  await idbDelete(STORE_NOTES, id)
}

export async function listCached(): Promise<CachedNote[]> {
  return idbGetAll<CachedNote>(STORE_NOTES)
}
