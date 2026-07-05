import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Let the Playwright e2e frontend build into its own dir (NEXT_DIST_DIR=.next-e2e)
  // so it doesn't share .next with the dev server. They inline different
  // NEXT_PUBLIC_* values (project id, emulator ports, API url); a shared build
  // cache serves whichever compiled last, silently poisoning the other.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  outputFileTracingRoot: path.join(__dirname, "./"),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async rewrites() {
    // Proxy Firebase Auth routes to Firebase Hosting
    // Required when using custom domains with Firebase Auth
    const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!firebaseProjectId) {
      return [];
    }

    return [
      {
        source: '/__/auth/:path*',
        destination: `https://${firebaseProjectId}.firebaseapp.com/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
