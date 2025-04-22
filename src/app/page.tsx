'use client'

import React from 'react'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { DrawingGridManager } from '@/components/grid/DrawingGridManager'

export default function Home() {
  return (
    <AuthGuard>
      <div className="h-screen w-full">
        <DrawingGridManager />
      </div>
    </AuthGuard>
  )
}