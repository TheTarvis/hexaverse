/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: '.next',
  // Enable importing JSON files
  webpack: (config) => {
    config.module.rules.push({
      test: /\.json$/,
      type: 'json',
    });
    return config;
  },
}

export default nextConfig
