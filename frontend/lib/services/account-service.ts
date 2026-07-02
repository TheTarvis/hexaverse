// Account service — typed wrapper around the /v1/accounts API.

import { apiClient, type ApiError } from '../api-client'
import type { Account, AccountProfile, CreateAccountRequest } from '../types/account'

class AccountService {
  // GET /v1/accounts/firestore
  async getCurrentAccount(): Promise<Account> {
    const response = await apiClient.get<Account>('/v1/accounts/firestore')
    return response.data
  }

  // GET /v1/accounts/{accountId}
  async getAccountById(accountId: string): Promise<Account> {
    const response = await apiClient.get<Account>(`/v1/accounts/${accountId}`)
    return response.data
  }

  // GET /v1/accounts/{accountId}/profile — limited public DTO
  async getAccountProfile(accountId: string): Promise<AccountProfile> {
    const response = await apiClient.get<AccountProfile>(`/v1/accounts/${accountId}/profile`)
    return response.data
  }

  // POST /v1/accounts
  async createAccount(profileData: CreateAccountRequest = {}): Promise<Account> {
    const response = await apiClient.post<Account>('/v1/accounts', profileData)
    return response.data
  }

  async checkAccountExists(): Promise<Account | null> {
    try {
      return await this.getCurrentAccount()
    } catch (error) {
      if ((error as ApiError).status === 404) {
        return null
      }
      throw error
    }
  }
}

export const accountService = new AccountService()
export default accountService
