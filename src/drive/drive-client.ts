import { idbGet, idbSet, idbDelete, STORE_META } from '../utils/idb'

const BASE = 'https://www.googleapis.com'

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
  mimeType?: string
}

export class DriveClient {
  constructor(private getToken: () => Promise<string | null>) {}

  private async authHeaders(contentType?: string): Promise<Record<string, string>> {
    const token = await this.getToken()
    if (!token) throw new AuthError('Not authenticated')
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (contentType) headers['Content-Type'] = contentType
    return headers
  }

  private checkAuthResponse(res: Response, context: string): void {
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(`${context}: ${res.status}`)
    }
  }

  async listNotes(folderId: string): Promise<DriveFile[]> {
    const q = `'${folderId}' in parents and (mimeType='text/markdown' or name contains '.md') and trashed=false`
    const url = `${BASE}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,mimeType)&pageSize=1000&orderBy=modifiedTime desc`
    const res = await fetch(url, { headers: await this.authHeaders() })
    this.checkAuthResponse(res, 'listNotes')
    if (!res.ok) throw new Error(`listNotes failed: ${res.status}`)
    const data = await res.json()
    return data.files ?? []
  }

  async readFile(fileId: string): Promise<string> {
    const res = await fetch(`${BASE}/drive/v3/files/${fileId}?alt=media`, {
      headers: await this.authHeaders()
    })
    this.checkAuthResponse(res, 'readFile')
    if (!res.ok) throw new Error(`readFile failed: ${res.status}`)
    return res.text()
  }

  async getMetadata(fileId: string): Promise<DriveFile> {
    const res = await fetch(`${BASE}/drive/v3/files/${fileId}?fields=id,name,modifiedTime,mimeType`, {
      headers: await this.authHeaders()
    })
    this.checkAuthResponse(res, 'getMetadata')
    if (!res.ok) throw new Error(`getMetadata failed: ${res.status}`)
    return res.json()
  }

  async createFile(folderId: string, name: string, content: string): Promise<DriveFile> {
    const metadata = { name: this.ensureMdExt(name), mimeType: 'text/markdown', parents: [folderId] }
    const body = this.buildMultipart(metadata, content)
    const res = await fetch(
      `${BASE}/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,mimeType`,
      {
        method: 'POST',
        headers: await this.authHeaders(body.contentType),
        body: body.data
      }
    )
    this.checkAuthResponse(res, 'createFile')
    if (!res.ok) throw new Error(`createFile failed: ${res.status}`)
    return res.json()
  }

  async updateFile(fileId: string, content: string): Promise<DriveFile> {
    const res = await fetch(
      `${BASE}/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,modifiedTime,mimeType`,
      {
        method: 'PATCH',
        headers: await this.authHeaders('text/markdown'),
        body: content
      }
    )
    this.checkAuthResponse(res, 'updateFile')
    if (!res.ok) throw new Error(`updateFile failed: ${res.status}`)
    return res.json()
  }

  async renameFile(fileId: string, name: string): Promise<DriveFile> {
    const res = await fetch(`${BASE}/drive/v3/files/${fileId}?fields=id,name,modifiedTime,mimeType`, {
      method: 'PATCH',
      headers: await this.authHeaders('application/json'),
      body: JSON.stringify({ name: this.ensureMdExt(name) })
    })
    this.checkAuthResponse(res, 'renameFile')
    if (!res.ok) throw new Error(`renameFile failed: ${res.status}`)
    return res.json()
  }

  async deleteFile(fileId: string): Promise<void> {
    const res = await fetch(`${BASE}/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: await this.authHeaders()
    })
    this.checkAuthResponse(res, 'deleteFile')
    if (!res.ok && res.status !== 404) throw new Error(`deleteFile failed: ${res.status}`)
  }

  async ensureFolder(name = 'MarkFlow'): Promise<string> {
    // First try to get stored folder ID
    const storedId = await idbGet<string>(STORE_META, 'folderId')
    if (storedId) {
      try {
        // Verify the folder still exists and is accessible
        const verify = await fetch(`${BASE}/drive/v3/files/${storedId}?fields=id,name`, {
          headers: await this.authHeaders()
        })
        if (verify.ok) {
          return storedId
        }
      } catch {
        // Folder not accessible, remove stored ID
        await idbDelete(STORE_META, 'folderId')
      }
    }

    // Try to search for existing folder (may fail with 403 if insufficient scope)
    try {
      const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`
      const res = await fetch(
        `${BASE}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
        { headers: await this.authHeaders() }
      )
      if (res.status === 403) {
        // Insufficient scope - assume folder doesn't exist and create new one
        throw new Error('Insufficient scope for search')
      }
      this.checkAuthResponse(res, 'ensureFolder')
      if (!res.ok) throw new Error(`ensureFolder lookup failed: ${res.status}`)
      const data = await res.json()
      if (data.files?.length) {
        const folderId = data.files[0].id
        await idbSet(STORE_META, folderId, 'folderId')
        return folderId
      }
    } catch (err) {
      // If search failed due to scope or other error, create new folder
      if (!(err instanceof Error) || !err.message.includes('Insufficient scope')) {
        console.warn('Folder search failed, creating new folder:', err instanceof Error ? err.message : String(err))
      }
    }

    // Create new folder
    const create = await fetch(`${BASE}/drive/v3/files?fields=id`, {
      method: 'POST',
      headers: await this.authHeaders('application/json'),
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' })
    })
    this.checkAuthResponse(create, 'ensureFolder create')
    if (!create.ok) throw new Error(`ensureFolder create failed: ${create.status}`)
    const folder = await create.json()
    await idbSet(STORE_META, folder.id, 'folderId')
    return folder.id
  }

  private ensureMdExt(name: string): string {
    return /\.md$/i.test(name) ? name : `${name}.md`
  }

  private buildMultipart(metadata: object, content: string) {
    const boundary = 'markflow_' + Math.random().toString(36).slice(2)
    const data = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: text/markdown; charset=UTF-8',
      '',
      content,
      `--${boundary}--`,
      ''
    ].join('\r\n')
    return { contentType: `multipart/related; boundary=${boundary}`, data }
  }
}
