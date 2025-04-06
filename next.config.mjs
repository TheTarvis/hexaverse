/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NEXT_PUBLIC_FIREBASE_ENV === 'emulator' ? 'export' : undefined,
  // Set distDir for Firebase emulator
  distDir: process.env.NEXT_PUBLIC_FIREBASE_ENV === 'emulator' ? 'public' : '.next',
  // Ensure images are properly optimized
  images: {
    unoptimized: process.env.NEXT_PUBLIC_FIREBASE_ENV === 'emulator'
  }
}

export default nextConfig
