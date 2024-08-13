/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
      GITHUB_API_KEY: process.env.GITHUB_API_KEY,
    },
  }
  
  export default nextConfig;