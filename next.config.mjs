/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NEXT_PUBLIC_FIREBASE_ENV === 'emulator' ? 'export' : undefined,
  // We use standard .next directory for both normal and Firebase builds
  distDir: '.next',
  // Ensure images are properly optimized
  images: {
    unoptimized: process.env.NEXT_PUBLIC_FIREBASE_ENV === 'emulator'
  }
}

export default nextConfig
