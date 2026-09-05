import { registerSW } from 'virtual:pwa-register'

export function registerScioGeoServiceWorker() {
  if (!import.meta.env.PROD) return

  registerSW({
    immediate: true,
    onRegisterError(error) {
      console.error('Scio Geo service worker registration failed.', error)
    },
  })
}
