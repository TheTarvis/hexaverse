import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountService } from './account-service'
import { apiClient } from '../api-client'

vi.mock('../api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockApiClient = vi.mocked(apiClient)

describe('AccountService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getCurrentAccount', () => {
    it('should fetch current account', async () => {
      const mockAccount = {
        id: 'account-123',
        name: 'John Doe',
        email: 'john@example.com',
      }

      mockApiClient.get.mockResolvedValueOnce({
        data: mockAccount,
        status: 200,
        headers: new Headers(),
      })

      const result = await accountService.getCurrentAccount()

      expect(mockApiClient.get).toHaveBeenCalledWith('/v1/accounts/firestore')
      expect(result).toEqual(mockAccount)
    })
  })

  describe('getAccountById', () => {
    it('should fetch account by ID', async () => {
      const accountId = 'account-123'
      const mockAccount = { id: accountId, name: 'Jane Doe' }

      mockApiClient.get.mockResolvedValueOnce({
        data: mockAccount,
        status: 200,
        headers: new Headers(),
      })

      const result = await accountService.getAccountById(accountId)

      expect(mockApiClient.get).toHaveBeenCalledWith(`/v1/accounts/${accountId}`)
      expect(result).toEqual(mockAccount)
    })
  })

  describe('createAccount', () => {
    it('should create account with profile data', async () => {
      const profileData = {
        name: 'New User',
        email: 'new@example.com',
        email_verified: false,
      }

      mockApiClient.post.mockResolvedValueOnce({
        data: { id: 'account-new', ...profileData },
        status: 200,
        headers: new Headers(),
      })

      const result = await accountService.createAccount(profileData)

      expect(mockApiClient.post).toHaveBeenCalledWith('/v1/accounts', profileData)
      expect(result.id).toBe('account-new')
    })

    it('should create account with empty profile data', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        data: { id: 'account-new' },
        status: 200,
        headers: new Headers(),
      })

      const result = await accountService.createAccount()

      expect(mockApiClient.post).toHaveBeenCalledWith('/v1/accounts', {})
      expect(result.id).toBe('account-new')
    })
  })

  describe('checkAccountExists', () => {
    it('returns the account when present', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { id: 'a-1' },
        status: 200,
        headers: new Headers(),
      })

      const result = await accountService.checkAccountExists()
      expect(result?.id).toBe('a-1')
    })

    it('returns null when account does not exist', async () => {
      const err = new Error('not found') as Error & { status?: number }
      err.status = 404
      mockApiClient.get.mockRejectedValueOnce(err)

      const result = await accountService.checkAccountExists()
      expect(result).toBeNull()
    })
  })
})
