// Service layer exports — typed wrappers around ApiClient for each domain.
// Per-domain exports are added by `/new-domain`.

export { accountService } from './account-service'
export { default as AccountService } from './account-service'

export { corporationService } from './corporation-service'
export { default as CorporationService } from './corporation-service'

export { galaxyService, adaptGalaxy, START_AREA_URL } from './galaxy-service'
export { default as GalaxyService } from './galaxy-service'

export { systemService } from './system-service'
export { default as SystemService } from './system-service'

export { fleetService } from './fleet-service'
export { default as FleetService } from './fleet-service'

export { actionService } from './action-service'
export { default as ActionService } from './action-service'
