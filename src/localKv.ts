import fs from 'fs'
import path from 'path'

export function createLocalKV(filePath: string = './.data/kv.json') {
  const memoryStore = new Map<string, string>()
  let useFs = false

  try {
    if (typeof fs !== 'undefined' && fs.existsSync && fs.mkdirSync) {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      useFs = true
    }
  } catch (e) {
    // Safe downgrade to memory store
  }

  const loadData = (): Record<string, { value: string; expiresAt?: number }> => {
    if (!useFs) {
      const obj: Record<string, { value: string; expiresAt?: number }> = {}
      for (const [key, valStr] of memoryStore.entries()) {
        try {
          obj[key] = JSON.parse(valStr)
        } catch {
          obj[key] = { value: valStr }
        }
      }
      return obj
    }
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      }
    } catch (e) {
      console.error('Failed to load local KV data:', e)
    }
    return {}
  }

  const saveData = (data: Record<string, { value: string; expiresAt?: number }>) => {
    if (!useFs) {
      memoryStore.clear()
      for (const [key, item] of Object.entries(data)) {
        memoryStore.set(key, JSON.stringify(item))
      }
      return
    }
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save local KV data:', e)
    }
  }

  return {
    async get(key: string): Promise<string | null> {
      const data = loadData()
      const item = data[key]
      if (!item) return null
      if (item.expiresAt && Date.now() > item.expiresAt) {
        delete data[key]
        saveData(data)
        return null
      }
      return item.value
    },
    async put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number }): Promise<void> {
      const data = loadData()
      let expiresAt: number | undefined
      if (options?.expirationTtl) {
        expiresAt = Date.now() + options.expirationTtl * 1000
      } else if (options?.expiration) {
        expiresAt = options.expiration * 1000
      }
      data[key] = { value, expiresAt }
      saveData(data)
    },
    async delete(key: string): Promise<void> {
      const data = loadData()
      delete data[key]
      saveData(data)
    },
  }
}
