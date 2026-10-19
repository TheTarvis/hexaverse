import { useId, type ReactNode } from 'react'

// Machado et al. severity-1 matrices, applied in linear RGB, not encoded sRGB.
// Source tables: https://raw.githubusercontent.com/cran/colorspace/master/R/cvd.R
// Method/linear-space notes: https://colorspace.r-forge.r-project.org/reference/simulate_cvd.html
const MATRICES = {
  protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
  deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
  tritanopia: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
  grayscale: '0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0',
} as const
export type VisionPreview = 'none' | keyof typeof MATRICES

/** Review aid only; palette selection and all controls stay outside the filter. */
export function MapVisionPreview({ mode, children }: { mode: VisionPreview; children: ReactNode }) {
  const id = `map-vision-${useId().replaceAll(':', '')}`
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs><filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="linearRGB">
        {mode !== 'none' && <feColorMatrix type="matrix" values={MATRICES[mode]} />}
      </filter></defs>
    </svg>
    <div data-testid="map-vision-preview" data-vision={mode} style={{ position: 'absolute', inset: 0, filter: mode === 'none' ? undefined : `url(#${id})` }}>{children}</div>
  </>
}
