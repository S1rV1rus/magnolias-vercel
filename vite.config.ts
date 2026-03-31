import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  server: {
    port: 8082,
    headers: {
      // Blocks the page from being embedded in iframes (clickjacking protection)
      'X-Frame-Options': 'DENY',
      // Prevents browser from guessing the content type (MIME sniffing)
      'X-Content-Type-Options': 'nosniff',
      // Controls referrer info sent with requests
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Restricts browser features available to the page
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      // Content Security Policy: the main XSS shield
      // - default-src 'self': only load resources from same origin
      // - script-src 'self' 'unsafe-inline': allow inline scripts (needed by Vite/React HMR in dev)
      // - style-src 'self' 'unsafe-inline': allow inline styles (needed by Tailwind)
      // - img-src 'self' data: https:: allow images from same origin, data URIs, and HTTPS
      // - connect-src 'self' https://*.supabase.co wss://*.supabase.co: allow Supabase API calls
      // - font-src 'self' https://fonts.gstatic.com: allow Google Fonts
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "font-src 'self' https://fonts.gstatic.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
  },
})
