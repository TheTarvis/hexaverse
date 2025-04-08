'use client'

import React from 'react'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { GridManager } from '@/components/grid/GridManager'

export default function Home() {
  return (
    <AuthGuard>
      <div className="h-screen w-full">
        <GridManager />
      </div>
    </AuthGuard>
  )
}