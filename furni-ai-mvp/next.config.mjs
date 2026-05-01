/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb'
    }
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.replicate.delivery' },
      { protocol: 'https', hostname: '**.replicate.com' }
    ]
  }
};

export default nextConfig;
