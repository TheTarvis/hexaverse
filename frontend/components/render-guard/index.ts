// index.ts — barrel for the shared render-context guard module
// (add-renderer-availability-states). Composition contract (design.md):
//
//   guard.status === 'live'
//     ? <CanvasRegionBoundary key={attempt} onError={guard.reportRenderError}
//                             fallback={<RendererStateNotice … />}>
//         {/* GalaxyGraph, or the port's BoardCanvas content */}
//       </CanvasRegionBoundary>
//     : <RendererStateNotice … />

export { probeWebgl2, type ProbeOutcome } from './probe'
export {
  reduceGuard,
  type GuardStatus,
  type FailureCause,
  type GuardState,
  type GuardEvent,
} from './guard-machine'
export { recordRendererFailure, type RenderFailureRecord, type RecordFn } from './record-renderer-failure'
export { useRenderGuard, type RenderGuardOptions, type RenderGuard } from './use-render-guard'
export { RendererStateNotice, type RendererStateNoticeProps } from './RendererStateNotice'
export { CanvasRegionBoundary, type CanvasRegionBoundaryProps } from './CanvasRegionBoundary'
