import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FleetRoster } from './FleetRoster'

vi.mock('@/hooks/use-fleets',()=>({useMyFleets:()=>({data:[{id:'fleet_abcdef12',name:'Peregrine',systemId:'s1',state:{Mode:1,Park:{Kind:2}},roster:{cargo:{fuel:3}}},{id:'fleet_12345678',systemId:'s1',state:{Mode:1,Park:{Kind:2}}}]})}))
vi.mock('@/hooks/use-galaxy',()=>({useGalaxy:()=>({data:{nodes:[{id:'s1',name:'Axion'}]}})}))
vi.mock('@/hooks/use-actions',()=>({useCancelAction:()=>({mutate:vi.fn()})}))
it('uses served names and a legacy fallback without changing selection on inspection',()=>{
 const select=vi.fn()
 render(<QueryClientProvider client={new QueryClient()}><FleetRoster worldTime={1} scale={1} activeFleetId="fleet_abcdef12" commandOwner="view" onSelect={select} /></QueryClientProvider>)
 expect(screen.getByTestId('fleet-row-fleet_abcdef12')).toHaveTextContent('Peregrine')
 expect(screen.getByTestId('fleet-row-fleet_abcdef12')).toHaveAttribute('aria-pressed','true')
 expect(screen.getByTestId('fleet-row-fleet_12345678')).toHaveTextContent('Fleet 12345678')
 expect(select).not.toHaveBeenCalled()
 fireEvent.click(screen.getByTestId('fleet-row-fleet_12345678'))
 expect(select).toHaveBeenCalledWith(expect.objectContaining({id:'fleet_12345678'}))
})
