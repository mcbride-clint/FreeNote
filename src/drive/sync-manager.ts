import { idbDelete, idbGet, idbGetAll, idbSet, STORE_META, STORE_QUEUE } from '../utils/idb'
import { DriveClient } from './drive-client'
import { CachedNote, getCached, putCached } from './file-cache'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

interface QueueEntry {
  id: string
  content: string
  queuedAt: number
}

export class SyncManager {
  private pending = new Map<string, ReturnType<typeof setTimeout>>()
  private listeners = new Set<(status: SyncStatus, detail?: string) => void>()
  private savedListeners = new Set<(id: string) => void>()
  private currentStatus: SyncStatus = 'idle'

  constructor(private drive: DriveClient, private debounceMs = 1500) {
    window.addEventListener('online', () => this.flushOfflineQueue().catch(() => {}))
  }

  onNoteSaved(listener: (id: string) => void): () => void {
    this.savedListeners.add(listener)
    return () => this.savedListeners.delete(listener)
  }

  private notifySaved(id: string) {
    for (const l of this.savedListeners) l(id)
  }

  onStatusChange(listener: (status: SyncStatus, detail?: string) => void): () => void {
    this.listeners.add(listener)
    listener(this.currentStatus)
    return () => this.listeners.delete(listener)
  }

  private setStatus(status: SyncStatus, detail?: string) {
    this.currentStatus = status
    for (const l of this.listeners) l(status, detail)
  }

  scheduleWrite(noteId: string, content: string) {
    const existing = this.pending.get(noteId)
    if (existing) clearTimeout(existing)

    this.setStatus('saving')

    const timer = setTimeout(async () => {
      this.pending.delete(noteId)
      try {
        if (!navigator.onLine) {
          await this.queueOfflineWrite(noteId, content)
          await this.stampLocalCache(noteId, content)
          this.setStatus('offline')
          return
        }
        const updated = await this.drive.updateFile(noteId, content)
        await this.updateLocalCache(noteId, content, updated.modifiedTime)
        this.notifySaved(noteId)
        this.setStatus('saved')
      } catch (err) {
        await this.queueOfflineWrite(noteId, content)
        await this.stampLocalCache(noteId, content)
        this.setStatus('error', (err as Error).message)
      }
    }, this.debounceMs)

    this.pending.set(noteId, timer)
  }

  async flushPending(): Promise<void> {
    const entries = Array.from(this.pending.entries())
    for (const [id, timer] of entries) {
      clearTimeout(timer)
      this.pending.delete(id)
      const cached = await getCached(id)
      if (cached) {
        try {
          const updated = await this.drive.updateFile(id, cached.content)
          await this.updateLocalCache(id, cached.content, updated.modifiedTime)
        } catch {
          await this.queueOfflineWrite(id, cached.content)
        }
      }
    }
  }

  async flushOfflineQueue(): Promise<void> {
    if (!navigator.onLine) return
    const queue = await idbGetAll<QueueEntry>(STORE_QUEUE)
    if (!queue.length) return
    this.setStatus('saving')
    for (const item of queue) {
      try {
        const updated = await this.drive.updateFile(item.id, item.content)
        await this.updateLocalCache(item.id, item.content, updated.modifiedTime)
        await idbDelete(STORE_QUEUE, item.id)
      } catch (err) {
        this.setStatus('error', (err as Error).message)
        return
      }
    }
    this.setStatus('saved')
  }

  async getLastSyncedAt(): Promise<number | null> {
    const value = await idbGet<number>(STORE_META, 'lastSyncedAt')
    return value ?? null
  }

  async setLastSyncedAt(ts: number): Promise<void> {
    await idbSet(STORE_META, ts, 'lastSyncedAt')
  }

  private async queueOfflineWrite(id: string, content: string): Promise<void> {
    const entry: QueueEntry = { id, content, queuedAt: Date.now() }
    await idbSet(STORE_QUEUE, entry)
  }

  private async stampLocalCache(id: string, content: string): Promise<void> {
    const existing = await getCached(id)
    if (!existing) return
    const updated: CachedNote = { ...existing, content, localModifiedAt: Date.now(), dirty: true }
    await putCached(updated)
  }

  private async updateLocalCache(id: string, content: string, driveModifiedTime: string): Promise<void> {
    const existing = await getCached(id)
    if (!existing) return
    const updated: CachedNote = {
      ...existing,
      content,
      driveModifiedTime,
      localModifiedAt: Date.now(),
      dirty: false
    }
    await putCached(updated)
  }
}
