'use client'

import React, { useState } from 'react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import {
  CubeTransparentIcon,
  ViewfinderCircleIcon,
  SwatchIcon,
  BugAntIcon,
  AdjustmentsHorizontalIcon,
  VideoCameraIcon,
  SignalIcon,
  Cog8ToothIcon
} from '@heroicons/react/24/outline'
import { WebSocketListener } from '@/components/WebSocketListener'
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'

interface DebugState {
  wireframe: boolean
  hexSize: number
  colorScheme: string
  viewDistance: number
  tileDetailsEnabled: boolean
  followSelectedTile: boolean
  forceDarkMode: boolean
}

interface DebugMenuProps {
  debugState: {
    wireframe: boolean;
    hexSize: number;
    colorScheme: string;
    viewDistance: number;
    tileDetailsEnabled: boolean;
    followSelectedTile: boolean;
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
    name: 'Camera Follow', 
    description: 'Toggle camera follow mode for selected tiles', 
    action: 'toggleCameraFollow', 
    icon: VideoCameraIcon 
  },
  { 
    name: 'WebSocket', 
    description: 'Monitor WebSocket connections and messages', 
    action: 'toggleWebSocket', 
    icon: SignalIcon 
  },
  { 
    name: 'View Depth',
    description: 'Adjust the depth of view for tiles around the colony',
    action: 'viewDepthControl',
    icon: AdjustmentsHorizontalIcon 
  }
]

export function DebugMenu({ debugState, onDebugAction }: DebugMenuProps) {
  const [showWebSocketMonitor, setShowWebSocketMonitor] = useState(false);
  
  const handleViewDepthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue)) {
      onDebugAction('changeViewDepth', newValue);
    }
  };
  
  const handleDebugOptionClick = (action: string) => {
    if (action === 'toggleWebSocket') {
      setShowWebSocketMonitor(!showWebSocketMonitor);
    } else {
      onDebugAction(action);
    }
  };

  return (
    <div className="absolute right-4 top-4 z-50">
      <Menu as="div" className="relative inline-block text-left">
        <div>
          <Menu.Button className="inline-flex w-full justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
            <Cog8ToothIcon className="h-5 w-5" aria-hidden="true" />
          </Menu.Button>
        </div>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right divide-y divide-zinc-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:divide-zinc-700 dark:bg-zinc-800">
            <div className="px-1 py-1">
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onDebugAction('toggleWireframe')}
                    className={`${
                      active ? 'bg-indigo-500 text-white' : 'text-zinc-900 dark:text-zinc-100'
                    } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                  >
                    {debugState.wireframe ? 'Disable' : 'Enable'} Wireframe
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onDebugAction('adjustSize')}
                    className={`${
                      active ? 'bg-indigo-500 text-white' : 'text-zinc-900 dark:text-zinc-100'
                    } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                  >
                    Adjust Size ({debugState.hexSize})
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onDebugAction('changeColorScheme')}
                    className={`${
                      active ? 'bg-indigo-500 text-white' : 'text-zinc-900 dark:text-zinc-100'
                    } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                  >
                    Color Scheme: {debugState.colorScheme}
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onDebugAction('toggleTileDetails')}
                    className={`${
                      active ? 'bg-indigo-500 text-white' : 'text-zinc-900 dark:text-zinc-100'
                    } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                  >
                    {debugState.tileDetailsEnabled ? 'Disable' : 'Enable'} Tile Details
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onDebugAction('toggleCameraFollow')}
                    className={`${
                      active ? 'bg-indigo-500 text-white' : 'text-zinc-900 dark:text-zinc-100'
                    } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                  >
                    {debugState.followSelectedTile ? 'Disable' : 'Enable'} Camera Follow
                  </button>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
      
      {showWebSocketMonitor && (
        <div className="absolute right-0 top-12 w-96 mb-2 bg-white dark:bg-zinc-900 shadow-lg rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
          <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
            <h3 className="text-sm font-medium">WebSocket Monitor</h3>
            <button 
              onClick={() => setShowWebSocketMonitor(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span className="sr-only">Close</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <WebSocketListener />
        </div>
      )}
    </div>
  )
} 