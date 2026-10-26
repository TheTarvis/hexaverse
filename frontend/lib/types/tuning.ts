export interface TuningField {
  key: string
  label: string
  group: string
  unit: string
  default: number
  min: number
  max: number
  integer?: boolean
  regenerate?: boolean
}
export interface TuningProfile { version: number; values: Record<string, number> }
export interface TuningSnapshot {
  fields: TuningField[]
  profile: TuningProfile
  active: Record<string, number>
  restartPending: boolean
}
