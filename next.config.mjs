/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
      GITHUB_API_KEY: process.env.GITHUB_API_KEY,
    },
    webpack: (config, { isServer }) => {
      if (!isServer) {
        config.watchOptions = {
          ignored: ['**/github_cache.sqlite']
        };
      }
      return config;
    },
  };
  
  export default nextConfig;
  