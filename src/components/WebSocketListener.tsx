'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { checkHealth, getWebSocketEndpoint, testAuthentication } from '@/services/websocket';
import { getAuthToken } from '@/services/auth';
import { WebSocketMessage, createNotificationMessage, createPingMessage } from '@/types/websocket';
import { useAuth } from '@/contexts/AuthContext';

interface WebSocketListenerProps {
  messageType?: string;
}

export const WebSocketListener: React.FC<WebSocketListenerProps> = ({ messageType: initialMessageType }) => {
  const { userToken } = useAuth();
  
  const { isConnected, connect, disconnect, sendMessage, connectionState } = useWebSocket({
    onMessage: (data) => {
      if (!filterActive || (messageType && data.type === messageType)) {
        setMessages((prev) => [data, ...prev].slice(0, 20)); // Keep last 20 messages
      }
    },
    autoConnect: true,
  });
  
  const [messages, setMessages] = useState<any[]>([]);
  const [messageType, setMessageType] = useState<string | undefined>(initialMessageType);
  const [filterActive, setFilterActive] = useState<boolean>(!!initialMessageType);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [authTokenStatus, setAuthTokenStatus] = useState<string | null>(null);
  const [endpointUrl, setEndpointUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isTestingAuth, setIsTestingAuth] = useState(false);
  const [authTestResult, setAuthTestResult] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(true);

  const handleClearMessages = () => {
    setMessages([]);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setMessageType(value || undefined);
  };

  const toggleConnection = async () => {
    if (isConnected) {
      disconnect();
    } else {
      try {
        setAuthError(null);
        await connect();
      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        if (error instanceof Error) {
          setAuthError(`Connection error: ${error.message}`);
        } else {
          setAuthError('Unknown connection error');
        }
      }
    }
  };

  const handleSendPing = () => {
    sendMessage({ 
      type: 'ping', 
      timestamp: Date.now(),
      client: 'debug-panel'
    });
  };

  const handleTestAuth = async () => {
    setIsTestingAuth(true);
    setAuthTestResult('Testing authentication...');
    
    try {
      const result = await testAuthentication();
      setAuthTestResult(result.message);
      
      if (!result.success) {
        console.warn('Authentication test failed:', result.message);
      }
    } catch (error) {
      console.error('Error testing authentication:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setAuthTestResult(`Auth test error: ${message}`);
    } finally {
      setIsTestingAuth(false);
    }
    
    // Clear after 10 seconds
    setTimeout(() => {
      setAuthTestResult(null);
    }, 10000);
  };

  const handleHealthCheck = async () => {
    setIsCheckingHealth(true);
    setHealthStatus('Checking...');
    
    try {
      const isHealthy = await checkHealth();
      setHealthStatus(isHealthy ? 'Healthy' : 'Unhealthy');
    } catch (error) {
      console.error('Error checking health:', error);
      setHealthStatus('Error checking health');
    } finally {
      setIsCheckingHealth(false);
    }
    
    // Clear status after 5 seconds
    setTimeout(() => {
      setHealthStatus(null);
    }, 5000);
  };

  const checkAuthToken = async () => {
    try {
      setAuthError(null);
      
      // Get and display the token
      const token = await getAuthToken();
      if (token) {
        // Truncate the token for display
        const tokenStart = token.substring(0, 25);
        const tokenEnd = token.substring(token.length - 10);
        setAuthTokenStatus(`Token: ${tokenStart}...${tokenEnd} (${token.length} chars)`);
      } else {
        setAuthTokenStatus('No token available - you may need to log in');
      }
      
      // Get the full endpoint URL
      const endpoint = await getWebSocketEndpoint();
      setEndpointUrl(endpoint);
    } catch (error) {
      console.error('Error checking auth token:', error);
      if (error instanceof Error) {
        setAuthError(`Auth error: ${error.message}`);
      } else {
        setAuthError('Unknown auth error');
      }
      setAuthTokenStatus('Error retrieving token');
    }
    
    // Clear after 30 seconds
    setTimeout(() => {
      setAuthTokenStatus(null);
      setEndpointUrl(null);
    }, 30000);
  };

  // Run a health check automatically on component mount
  useEffect(() => {
    handleHealthCheck();
    checkAuthToken();
  }, []);

  // Get connection state color
  const getConnectionStateColor = () => {
    switch (connectionState) {
      case 'CONNECTED': return 'bg-green-500';
      case 'CONNECTING': return 'bg-blue-500';
      case 'RECONNECTING': return 'bg-yellow-500';
      case 'DISCONNECTED': return 'bg-gray-500';
      case 'ERROR': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  return (
    <div className="p-3 h-full overflow-hidden flex flex-col">
      {/* Connection header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center">
          <div
            className={`w-3 h-3 rounded-full mr-2 ${getConnectionStateColor()}`}
          />
          <span className="text-sm font-medium">
            {connectionState || 'Unknown'}
          </span>
          
          {healthStatus && (
            <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
              healthStatus === 'Healthy'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                : healthStatus === 'Checking...'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
            }`}>
              {healthStatus}
            </span>
          )}
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={checkAuthToken}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Check Token
          </button>
          
          <button
            onClick={handleTestAuth}
            disabled={isTestingAuth}
            className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-yellow-900 dark:text-yellow-300 dark:hover:bg-yellow-800"
          >
            Test Auth
          </button>
          
          <button
            onClick={handleHealthCheck}
            disabled={isCheckingHealth}
            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
          >
            Health Check
          </button>
          
          <button
            onClick={toggleConnection}
            className={`px-3 py-1 text-xs rounded ${
              isConnected 
                ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800' 
                : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800'
            }`}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </button>
          
          <button
            onClick={handleSendPing}
            disabled={!isConnected}
            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
          >
            Send Ping
          </button>
        </div>
      </div>

      {/* Information note about using HTTP protocol */}
      {showNote && (
        <div className="mb-3 p-2 bg-blue-50 text-blue-800 text-xs rounded flex justify-between items-center dark:bg-blue-900 dark:text-blue-300">
          <div>
            <div className="font-medium">Using HTTP Protocol for WebSocket</div>
            <div>Using http:// protocol for WebSocket connections based on working Postman configuration.</div>
          </div>
          <button 
            onClick={() => setShowNote(false)}
            className="ml-2 p-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
      
      {/* Auth error */}
      {authError && (
        <div className="mb-3 p-2 bg-red-100 text-red-800 text-xs rounded dark:bg-red-900 dark:text-red-300">
          <div className="font-medium">Authentication Error</div>
          <div>{authError}</div>
        </div>
      )}
      
      {/* Auth test result */}
      {authTestResult && (
        <div className={`mb-3 p-2 text-xs rounded ${
          authTestResult.includes('successful') 
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
            : authTestResult === 'Testing authentication...'
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
        }`}>
          <div className="font-medium">Auth Test Result</div>
          <div>{authTestResult}</div>
        </div>
      )}
      
      {/* Auth token info */}
      {(authTokenStatus || endpointUrl) && (
        <div className="mb-3 bg-gray-50 p-2 rounded text-xs dark:bg-zinc-800">
          {authTokenStatus && (
            <div className="mb-1 break-all">
              <span className="font-medium">Auth Token:</span> {authTokenStatus}
            </div>
          )}
          {endpointUrl && (
            <div className="break-all">
              <span className="font-medium">Endpoint:</span> {endpointUrl}
            </div>
          )}
        </div>
      )}
      
      {/* Filter controls */}
      <div className="flex items-center mb-3 bg-gray-50 p-2 rounded dark:bg-zinc-800">
        <div className="flex items-center mr-3">
          <input
            id="filter-toggle" 
            type="checkbox"
            checked={filterActive}
            onChange={() => setFilterActive(!filterActive)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
          <label htmlFor="filter-toggle" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            Filter
          </label>
        </div>
        
        <input
          type="text"
          placeholder="Message type (e.g. 'ping')"
          value={messageType || ''}
          onChange={handleFilterChange}
          disabled={!filterActive}
          className="flex-grow text-sm p-1 border rounded disabled:opacity-50 disabled:bg-gray-100 dark:bg-zinc-700 dark:border-zinc-600 dark:text-white"
        />
        
        <button
          onClick={handleClearMessages}
          className="ml-2 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
        >
          Clear
        </button>
      </div>
      
      {/* Messages list */}
      <div className="flex-grow overflow-auto">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500 text-sm">No messages received yet</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {messages.map((msg, index) => (
              <li key={index} className="p-2 bg-gray-100 dark:bg-zinc-800 rounded text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-medium">
                    {msg.type || 'Unknown'} 
                  </span>
                  <span className="text-gray-500">
                    {new Date(msg.timestamp || Date.now()).toLocaleTimeString()}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap overflow-auto max-h-40 text-xs bg-white p-1 rounded dark:bg-zinc-900">
                  {JSON.stringify(msg, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};