'use client'

import { Avatar } from '@/components/avatar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/dropdown'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@/components/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'
import { getEvents } from '@/data'
import { useAuth } from '@/contexts/AuthContext'
import { getVersionDisplay } from '@/utils/version'
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/16/solid'
import {
  Cog6ToothIcon,
  HomeIcon,
  GlobeAltIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  Square2StackIcon,
  TicketIcon,
  ViewColumnsIcon,
  CalendarIcon,
  LockClosedIcon
} from '@heroicons/react/20/solid'
import { usePathname } from 'next/navigation'
import { WebSocketStatusIndicator } from '@/components/websocket-status-indicator';
import { useState } from 'react'
import { LoginModal } from '@/components/auth/LoginModal'
import logger from '@/utils/logger';

function AccountDropdownMenu({ anchor }: { anchor: 'top start' | 'bottom end' }) {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      logger.error('Error signing out:', error);
    }
  };

  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem href="#">
        <UserCircleIcon />
        <DropdownLabel>My account</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="#">
        <ShieldCheckIcon />
        <DropdownLabel>Privacy policy</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="#">
        <LightBulbIcon />
        <DropdownLabel>Share feedback</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={handleSignOut}>
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>Sign out</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

export function ApplicationLayout({
  events,
  children,
}: {
  events: Awaited<ReturnType<typeof getEvents>>
  children: React.ReactNode
}) {
  let pathname = usePathname()
  const { user } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // Get display name and email from user
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';

  const handleLoginClick = () => {
    setShowLoginModal(true);
  };

  return (
    <>
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <SidebarLayout
        navbar={
          <Navbar>
            <NavbarSpacer />
            <WebSocketStatusIndicator compact inNavbar />
            <NavbarSection>
              <Dropdown>
                <DropdownButton as={NavbarItem}>
                  <Avatar src={user?.photoURL || ""} square />
                </DropdownButton>
                <AccountDropdownMenu anchor="bottom end" />
              </Dropdown>
            </NavbarSection>
          </Navbar>
        }
        sidebar={
          <Sidebar>
            <SidebarHeader>
              <Dropdown>
                <DropdownButton as={SidebarItem}>
                  <Avatar src="/teams/catalyst.svg" />
                  <SidebarLabel>Hexaverse</SidebarLabel>
                  <ChevronDownIcon />
                </DropdownButton>
                <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                  <DropdownItem href="/settings">
                    <Cog8ToothIcon />
                    <DropdownLabel>Settings</DropdownLabel>
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </SidebarHeader>

            <SidebarBody>
              <SidebarSection>
                <SidebarItem href="/" current={pathname === '/'}>
                  <HomeIcon />
                  <SidebarLabel>Home</SidebarLabel>
                </SidebarItem>
                {user ? (
                  <SidebarItem href="/colony" current={pathname.startsWith('/colony')}>
                    <GlobeAltIcon />
                    <SidebarLabel>Colony</SidebarLabel>
                  </SidebarItem>
                ) : (
                  <SidebarItem 
                    onClick={handleLoginClick}
                    className="text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400"
                  >
                    <LockClosedIcon className="text-amber-600 dark:text-amber-500" />
                    <SidebarLabel>
                      <span className="flex items-center gap-1">
                        Colony <span className="text-xs">(Login required)</span>
                      </span>
                    </SidebarLabel>
                  </SidebarItem>
                )}
                {/* <SidebarItem href="/events" current={pathname.startsWith('/events')}>
                  <Square2StackIcon />
                  <SidebarLabel>Events</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/orders" current={pathname.startsWith('/orders')}>
                  <TicketIcon />
                  <SidebarLabel>Orders</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/grid" current={pathname.startsWith('/grid')}>
                  <ViewColumnsIcon />
                  <SidebarLabel>Grid</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/settings" current={pathname.startsWith('/settings')}>
                  <Cog6ToothIcon />
                  <SidebarLabel>Settings</SidebarLabel>
                </SidebarItem> */}
              </SidebarSection>

              {/* <SidebarSection className="max-lg:hidden">
                <SidebarHeading>Upcoming Events</SidebarHeading>
                {events.map((event) => (
                  <SidebarItem key={event.id} href={event.url}>
                    {event.name}
                  </SidebarItem>
                ))}
              </SidebarSection> */}

              <SidebarSpacer />

              <SidebarSection>
                <SidebarItem href="/roadmap" current={pathname.startsWith('/roadmap')}>
                  <CalendarIcon />
                  <SidebarLabel>Road Map</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/support" current={pathname.startsWith('/support')}>
                  <QuestionMarkCircleIcon />
                  <SidebarLabel>Support</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/changelog">
                  <SparklesIcon/>
                  <SidebarLabel>
                    Changelog
                    <div className="text-xs text-gray-500 dark:text-gray-400">{getVersionDisplay()}</div>
                  </SidebarLabel>
                </SidebarItem>
                <WebSocketStatusIndicator />
              </SidebarSection>
            </SidebarBody>

            <SidebarFooter className="max-lg:hidden">
              {user ? (
                <Dropdown>
                  <DropdownButton as={SidebarItem}>
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar src={user?.photoURL || ""} className="size-10" square alt="" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                          {displayName}
                        </span>
                        <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                          {email}
                        </span>
                      </span>
                    </span>
                    <ChevronUpIcon />
                  </DropdownButton>
                  <AccountDropdownMenu anchor="top start" />
                </Dropdown>
              ) : (
                <SidebarItem 
                  onClick={handleLoginClick}
                  className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10 bg-indigo-100 dark:bg-indigo-800" square alt="">
                      <UserCircleIcon className="size-6 text-indigo-600 dark:text-indigo-300" />
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm/5 font-medium text-indigo-600 dark:text-indigo-300">
                        Sign In
                      </span>
                      <span className="block truncate text-xs/5 font-normal text-indigo-500 dark:text-indigo-400">
                        Log in to access all features
                      </span>
                    </span>
                  </span>
                </SidebarItem>
              )}
            </SidebarFooter>
          </Sidebar>
        }
      >
        {children}
      </SidebarLayout>
    </>
  )
}
