'use client'

import React from 'react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import {
  CubeTransparentIcon,
  ViewfinderCircleIcon,
  SwatchIcon,
  BugAntIcon,
} from '@heroicons/react/24/outline'

interface DebugMenuProps {
  debugState: {
    wireframe: boolean;
    hexSize: number;
    colorScheme: string;
  };
  onDebugAction: (action: string) => void;
}

const debugOptions = [
  { 
    name: 'Wireframe', 
    description: 'Toggle wireframe rendering of hexagons', 
    action: 'toggleWireframe', 
    icon: CubeTransparentIcon 
  },
  { 
    name: 'Hexagon Size', 
    description: 'Adjust the size of hexagons', 
    action: 'adjustSize', 
    icon: ViewfinderCircleIcon 
  },
  { 
    name: 'Color Scheme', 
    description: 'Change the color palette', 
    action: 'changeColorScheme', 
    icon: SwatchIcon 
  }
]

export function DebugMenu({ debugState, onDebugAction }: DebugMenuProps) {
  return (
    <div className="absolute top-4 right-4 z-10">
      <Popover className="relative">
        <PopoverButton className="flex items-center gap-x-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
          <BugAntIcon className="h-5 w-5 mr-1" />
          <span>Debug</span>
          <ChevronDownIcon className="h-5 w-5" aria-hidden="true" />
        </PopoverButton>

        <PopoverPanel
          transition
          className="absolute right-0 z-10 mt-2 w-80 origin-top-right transition data-[closed]:translate-y-1 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in"
        >
          <div className="overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5">
            <div className="p-4">
              {debugOptions.map((item) => (
                <div 
                  key={item.name} 
                  className="group relative flex gap-x-6 rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => onDebugAction(item.action)}
                >
                  <div className="mt-1 flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-gray-50 group-hover:bg-white">
                    <item.icon className="h-6 w-6 text-gray-600 group-hover:text-indigo-600" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      {item.name}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium text-gray-500">
                Current settings: {debugState.wireframe ? 'Wireframe' : 'Solid'}, 
                Size: {debugState.hexSize.toFixed(1)}, 
                Colors: {debugState.colorScheme}
              </div>
            </div>
          </div>
        </PopoverPanel>
      </Popover>
    </div>
  )
} 