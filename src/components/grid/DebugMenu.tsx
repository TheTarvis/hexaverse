'use client'

import React from 'react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import {
  CubeTransparentIcon,
  ViewfinderCircleIcon,
  SwatchIcon,
  BugAntIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline'

interface DebugMenuProps {
  debugState: {
    wireframe: boolean;
    hexSize: number;
    colorScheme: string;
    fogDepth: number;
    tileDetailsEnabled: boolean;
  };
  onDebugAction: (action: string, value?: any) => void;
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
  },
  { 
    name: 'Tile Details', 
    description: 'Toggle tile details slide-up panel', 
    action: 'toggleTileDetails', 
    icon: BugAntIcon 
  },
  { 
    name: 'Fog Depth', 
    description: 'Adjust the depth of fog tiles around the colony', 
    action: 'fogDepthControl', 
    icon: AdjustmentsHorizontalIcon 
  }
]

export function DebugMenu({ debugState, onDebugAction }: DebugMenuProps) {
  const handleFogDepthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue)) {
      onDebugAction('changeFogDepth', newValue);
    }
  };

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
              {debugOptions.slice(0, 4).map((item) => (
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
              
              <div className="group relative gap-x-6 rounded-lg p-3 hover:bg-gray-50">
                <div className="flex items-center">
                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-gray-50 group-hover:bg-white">
                    <AdjustmentsHorizontalIcon className="h-6 w-6 text-gray-600 group-hover:text-indigo-600" aria-hidden="true" />
                  </div>
                  <div className="ml-6">
                    <div className="font-semibold text-gray-900">
                      Fog Depth
                    </div>
                  </div>
                </div>
                <div className="mt-2 pl-16 pr-2">
                  <div className="flex items-center">
                    <input
                      type="range"
                      min="0"
                      max="30"
                      step="1"
                      value={debugState.fogDepth}
                      onChange={handleFogDepthChange}
                      className="w-full"
                    />
                    <span className="ml-2 text-sm text-gray-600 min-w-[2rem] text-right">
                      {debugState.fogDepth}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium text-gray-500">
                Current settings: {debugState.wireframe ? 'Wireframe' : 'Solid'}, 
                Size: {debugState.hexSize.toFixed(1)}, 
                Colors: {debugState.colorScheme},
                Fog: {debugState.fogDepth},
                Details: {debugState.tileDetailsEnabled ? 'On' : 'Off'}
              </div>
            </div>
          </div>
        </PopoverPanel>
      </Popover>
    </div>
  )
} 