// Service layer exports — typed wrappers around ApiClient for each domain.
// Per-domain exports are added by `/new-domain`.

export { accountService } from './account-service'
export { default as AccountService } from './account-service'

export { galaxyService, adaptGalaxy, START_AREA_URL } from './galaxy-service'
export { default as GalaxyService } from './galaxy-service'
