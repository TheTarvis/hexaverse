'use client'

import React from 'react'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { DrawingGridManager } from '@/components/grid/DrawingGridManager'
import { ColonyGridManager } from '@/components/grid/ColonyGridManager'

export default function Home() {
  return (
      // <div className="h-screen w-full">
      //   <DrawingGridManager />
      // </div>

      <AuthGuard>
        <div className="h-screen w-full">
          {/* <DrawingGridManager /> */}
          <ColonyGridManager />
        </div>
      </AuthGuard>
  )
}