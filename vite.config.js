import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Replace `your-repo-name` with your actual repo name on GitHub
export default defineConfig({
  plugins: [react()],
  base: '/facpub/',  
})
