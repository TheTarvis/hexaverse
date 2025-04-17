"use client"
import { NavbarItem, NavbarLabel } from '@/components/navbar';
import { SidebarItem, SidebarLabel } from '@/components/sidebar';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

export function WebSocketStatusIndicator({ compact = false, inNavbar = false }: { compact?: boolean, inNavbar?: boolean } = {}) {
  const { isConnected, connectionState } = useWebSocketContext();

  const getStatus = () => {
    if (isConnected) {
      return { color: 'bg-green-500', label: 'Connected' };
    }
    if (connectionState === 'CONNECTING') {
      return { color: 'bg-blue-500', label: 'Connecting' };
    }
    if (connectionState === 'ERROR') {
      return { color: 'bg-red-500', label: 'Error' };
    }
    return { color: 'bg-gray-400', label: 'Disconnected' };
  };
  const status = getStatus();

  const Item = inNavbar ? NavbarItem : SidebarItem;
  const Label = inNavbar ? NavbarLabel : SidebarLabel;

  return (
    <Item>
      <span className={`inline-block w-3 h-3 rounded-full mr-2 align-middle ${status.color}`} />
      {!compact && (
        <Label>
          {status.label}
        </Label>
      )}
    </Item>
  );
}
