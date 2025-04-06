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
  QuestionMarkCircleIcon,
  SparklesIcon,
  Square2StackIcon,
  TicketIcon,
  ViewColumnsIcon,
} from '@heroicons/react/20/solid'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

function AccountDropdownMenu({ anchor, onSignOut }: { anchor: 'top start' | 'bottom end', onSignOut: () => void }) {
  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem href="#">
        <UserCircleIcon 
          className="h-5 w-5 text-gray-600" 
          style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
          aria-hidden="true"
        />
        <DropdownLabel>My account</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="#">
        <ShieldCheckIcon 
          className="h-5 w-5 text-emerald-500" 
          style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
          aria-hidden="true"
        />
        <DropdownLabel>Privacy policy</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="#">
        <LightBulbIcon 
          className="h-5 w-5 text-gray-600" 
          style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
          aria-hidden="true"
        />
        <DropdownLabel>Share feedback</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="#" onClick={onSignOut}>
        <ArrowRightStartOnRectangleIcon 
          className="h-5 w-5 text-red-500" 
          style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
          aria-hidden="true"
        />
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
  const { signOut } = useAuth()

  return (
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <Dropdown>
              <DropdownButton as={NavbarItem}>
                <Avatar src="/users/erica.jpg" square />
              </DropdownButton>
              <AccountDropdownMenu anchor="bottom end" onSignOut={signOut} />
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
                <SidebarLabel>Catalyst</SidebarLabel>
                <ChevronDownIcon 
                  className="h-5 w-5 ml-2.5" 
                  style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
                  aria-hidden="true"
                />
              </DropdownButton>
              <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                <DropdownItem href="/settings">
                  <Cog8ToothIcon 
                    className="h-5 w-5 text-gray-600" 
                    style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="#">
                  <Avatar slot="icon" src="/teams/catalyst.svg" />
                  <DropdownLabel>Catalyst</DropdownLabel>
                </DropdownItem>
                <DropdownItem href="#">
                  <Avatar slot="icon" initials="BE" className="bg-purple-500 text-white" />
                  <DropdownLabel>Big Events</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="#">
                  <PlusIcon 
                    className="h-5 w-5" 
                    style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <DropdownLabel>New team&hellip;</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              <SidebarItem href="/" current={pathname === '/'}>
                <HomeIcon 
                  className="h-6 w-6" 
                  style={{ width: '1.5em', height: '1.5em', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <SidebarLabel>Home</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/colony" current={pathname.startsWith('/colony')}>
                <SparklesIcon 
                  className="h-6 w-6" 
                  style={{ width: '1.5em', height: '1.5em', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <SidebarLabel>Colony</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/events" current={pathname.startsWith('/events')}>
                <Square2StackIcon 
                  className="h-6 w-6" 
                  style={{ width: '1.5em', height: '1.5em', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <SidebarLabel>Events</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/orders" current={pathname.startsWith('/orders')}>
                <TicketIcon 
                  className="h-6 w-6" 
                  style={{ width: '1.5em', height: '1.5em', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <SidebarLabel>Orders</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/grid" current={pathname.startsWith('/grid')}>
                <ViewColumnsIcon 
                  className="h-6 w-6" 
                  style={{ width: '1.5em', height: '1.5em', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <SidebarLabel>Grid</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/settings" current={pathname.startsWith('/settings')}>
                <Cog6ToothIcon 
                  className="h-6 w-6" 
                  style={{ width: '1.5em', height: '1.5em', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <SidebarLabel>Settings</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            <SidebarSection className="max-lg:hidden">
              <SidebarHeading>Upcoming Events</SidebarHeading>
              {events.map((event) => (
                <SidebarItem key={event.id} href={event.url}>
                  {event.name}
                </SidebarItem>
              ))}
            </SidebarSection>

            <SidebarSpacer />

            <SidebarSection>
              <SidebarItem href="#">
                <QuestionMarkCircleIcon 
                  className="h-6 w-6" 
                  style={{ width: '1.5em', height: '1.5em', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <SidebarLabel>Support</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="#">
                <SparklesIcon 
                  className="h-6 w-6" 
                  style={{ width: '1.5em', height: '1.5em', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <SidebarLabel>Changelog</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>

          <SidebarFooter className="max-lg:hidden">
            <Dropdown>
              <DropdownButton as={SidebarItem}>
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar src="/users/erica.jpg" className="size-10" square alt="" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">Erica</span>
                    <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                      erica@example.com
                    </span>
                  </span>
                </span>
                <ChevronUpIcon 
                  className="h-5 w-5 ml-2.5" 
                  style={{ width: '1.25em', height: '1.25em', flexShrink: 0 }}
                  aria-hidden="true"
                />
              </DropdownButton>
              <AccountDropdownMenu anchor="top start" onSignOut={signOut} />
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
    >
      {children}
    </SidebarLayout>
  )
}
