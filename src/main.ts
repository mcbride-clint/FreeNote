import './styles/base.css'
import './styles/renderer.css'
import './styles/mobile.css'
import { registerSW } from 'virtual:pwa-register'
import { MarkFlowApp } from './app'
import { toast } from './ui/toast'

const updateSW = registerSW({
  onNeedRefresh() {
    const handle = toast.show('New version available. Refresh?', 'info', 8000)
    setTimeout(() => {
      handle.dismiss()
      updateSW(true)
    }, 4000)
  },
  onOfflineReady() {
    toast.show('Ready to work offline', 'success')
  }
})

const root = document.getElementById('app')
if (!root) throw new Error('No #app element')

const app = new MarkFlowApp(root)
app.mount().catch((err) => {
  console.error('Mount failed', err)
  toast.show(`Startup error: ${err.message}`, 'error', 8000)
})
