import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname

  // Only handle root path - all other paths resolve naturally via Next.js routing
  if (pathname !== '/') {
    return NextResponse.next()
  }

  // Detect environment
  const isLocalhost = hostname.includes('localhost')
  const isPreview = hostname.includes('vercel.app')
  const isAppDomain = hostname.startsWith('app.')
  const isWwwDomain = hostname.startsWith('www.')

  // Localhost development
  if (isLocalhost) {
    // Use ?site=marketing to test marketing site
    const site = request.nextUrl.searchParams.get('site')

    if (site === 'marketing') {
      // Let Next.js resolve to (marketing)/page.tsx
      return NextResponse.next()
    }

    // Default to app - redirect to new workflow canvas
    return NextResponse.redirect(new URL('/workflows', request.url))
  }

  // Preview deployments (default to app, use ?site=marketing to test marketing)
  if (isPreview) {
    const site = request.nextUrl.searchParams.get('site')

    if (site === 'marketing') {
      // Let Next.js resolve to (marketing)/page.tsx
      return NextResponse.next()
    }

    // Default to app - redirect to new workflow canvas
    return NextResponse.redirect(new URL('/workflows', request.url))
  }

  // Production: www.flywheeletl.io → marketing landing page
  if (isWwwDomain) {
    // Let Next.js resolve to (marketing)/page.tsx
    return NextResponse.next()
  }

  // Production: app.flywheeletl.io → new workflow canvas
  if (isAppDomain) {
    return NextResponse.redirect(new URL('/workflows', request.url))
  }

  // Default fallback: redirect to new workflow canvas
  return NextResponse.redirect(new URL('/workflows', request.url))
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
}
