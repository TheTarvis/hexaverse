import { NextResponse } from 'next/server'

// Extension point for host/path-based routing (e.g. a www marketing site vs an
// app subdomain, both served from this Next.js app). The starter has a single
// app surface, so everything passes through — auth gating happens client-side
// in components/layout-wrapper.tsx.
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
}
