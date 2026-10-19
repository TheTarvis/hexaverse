/** Orbit and annotation styling shared by the game and Storybook review. */
export interface OrbitAppearance {
  /** Opacity from 0 (invisible) to 1. */
  brightness: number
  /** Width in screen pixels, independent of camera distance. */
  thickness: number
  selectedBrightness: number
  selectedThickness: number
}

export interface LabelAppearance {
  visible: boolean
  opacity: number
  selectedVisible: boolean
  selectedOpacity: number
}


/** Accepted quiet-system treatment; selected objects remain easy to inspect. */
export const SYSTEM_ORBIT_APPEARANCE: OrbitAppearance = {
  brightness: 0.035,
  thickness: 0.5,
  selectedBrightness: 0.7,
  selectedThickness: 1.5,
}

export const SYSTEM_LABEL_APPEARANCE: LabelAppearance = {
  visible: false,
  opacity: 0.55,
  selectedVisible: true,
  selectedOpacity: 1,
}
