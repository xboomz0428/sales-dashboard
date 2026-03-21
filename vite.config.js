import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function aiSavePlugin() {
  return {
    name: 'ai-save-plugin',
    configureServer(server) {
      server.middlewares.use('/api/save-analysis', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const { filename, content } = JSON.parse(body)
            // sanitize: keep only safe chars (allow Chinese)
            const safeName = path.basename(filename)
            const dir = path.resolve(process.cwd(), 'AI_data')
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(path.join(dir, safeName), content, 'utf-8')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, path: `AI_data/${safeName}` }))
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: e.message }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), aiSavePlugin()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/tests/setup.js',
  },
})
