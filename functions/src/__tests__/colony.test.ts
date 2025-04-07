/**
 * Unit tests for colony.ts Cloud Functions
 */
import * as sinon from 'sinon';

// Create a mock for Firestore serverTimestamp
const serverTimestampMock = jest.fn().mockReturnValue('mock-timestamp');

// Mock the firebase-admin module first
const firestoreMock = {
  collection: jest.fn().mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn(),
      set: jest.fn().mockResolvedValue({}),
      id: 'new-colony-id'
    })
  })
};

// Mock the firebase-admin module
jest.mock('firebase-admin', () => {
  // Create the admin mock object
  const adminMock = {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => firestoreMock),
    auth: jest.fn().mockReturnValue({
      verifyIdToken: jest.fn()
    })
  };
  
  // Add the FieldValue property to firestore
  adminMock.firestore.FieldValue = {
    serverTimestamp: serverTimestampMock
  };
  
  return adminMock;
});

// Mock the firebase-functions module
jest.mock('firebase-functions/v2/https', () => ({
  onRequest: jest.fn((options, handler) => {
    // Store the handler function directly for testing
    const wrappedHandler = async (req: any, res: any) => {
      return handler(req, res);
    };
    
    // Add the handler directly to the wrapper for testing
    wrappedHandler.handler = handler;
    return wrappedHandler;
  })
}));

// Suppress logger output during tests
jest.mock('firebase-functions/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

// Mock the authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticatedHttpsOptions: {
    cors: true,
    region: 'us-central1'
  },
  authenticateRequest: jest.fn().mockResolvedValue('test-user-id')
}));

// Import modules after mocking
import * as admin from 'firebase-admin';
import { getColony, createColony } from '../colony';
import { authenticateRequest } from '../middleware/auth';
import { onRequest } from 'firebase-functions/v2/https';

describe('Colony Functions', () => {
  // Mock request and response
  let req: any;
  let res: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock request/response objects
    req = {
      query: {},
      body: {},
      headers: { authorization: 'Bearer mock-token' },
      app: {}
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    
    // Reset the mock responses
    firestoreMock.collection.mockClear();
    serverTimestampMock.mockClear();
  });
  
  describe('getColony function', () => {
    test('should return 400 if colony ID is missing', async () => {
      // Access the direct handler
      const handler = (getColony as any).handler;
      
      // Call the handler directly
      await handler(req, res);
      
      // Verify authentication was called
      expect(authenticateRequest).toHaveBeenCalledWith(req);
      
      // Verify response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Colony ID is required'
      });
    });
  });
  
  describe('createColony function', () => {
    test('should return 400 if colony name is missing', async () => {
      // Access the direct handler
      const handler = (createColony as any).handler;
      
      // Call the handler directly
      await handler(req, res);
      
      // Verify response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Colony name is required'
      });
    });
    
    test('should create a colony successfully', async () => {
      // Add a colony name
      req.body.name = 'Test Colony';
      
      // Access the direct handler
      const handler = (createColony as any).handler;
      
      // Call the handler directly
      await handler(req, res);
      
      // Verify Firestore was called
      expect(firestoreMock.collection).toHaveBeenCalledWith('colonies');
      expect(serverTimestampMock).toHaveBeenCalled();
      
      // Verify that json was called
      expect(res.json).toHaveBeenCalled();
    });
  });
}); 