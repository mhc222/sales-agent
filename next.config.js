/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output for Vercel
  output: 'standalone',

  // Ignore TypeScript errors in API routes (they use different patterns)
  typescript: {
    ignoreBuildErrors: false,
  },

  // Configure path aliases
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, './'),
      '@lib': require('path').resolve(__dirname, './src/lib'),
      '@agents': require('path').resolve(__dirname, './src/agents'),
    }
    return config
  },
}

module.exports = nextConfig
