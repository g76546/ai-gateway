import { serve } from '@hono/node-server'
import app from './src/index'
import { createLocalKV } from './src/localKv'

const port = Number(process.env.PORT) || 3000
const localKV = createLocalKV()

const envBindings = {
  KV: localKV as any,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
}

console.log(`Server starting on port ${port}...`)

serve({
  fetch: (req) => app.fetch(req, envBindings),
  port,
})

