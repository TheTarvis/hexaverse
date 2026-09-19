'use client'

// The transform loop — extracted from GL construction (openspec change
// `fix-world-time-render-loop`, design.md Decision 3, decided option B; USER
// RULING 3). It is the frame-loop authority for the picture AND for every
// hit target's position: it builds the frame's `SceneModel` once, at one
// `clock.now()`, projects it through the SAME basis the DOM hit layer and
// the GL renderer both read, writes every registered element's
// `style.transform`, and publishes the whole frame (scene + camera + basis +
// projected marks) to a ref everything else — `pickAt`, the off-screen chip
// membership, the GL draw loop — reads from.
//
// Runs directly under jsdom, with no GL fake needed: nothing here touches a
// canvas or a rendering context. It is gated on `available` alone (never on
// the renderer constructing), so a GL-refusing driver still gets positioned
// hit targets and off-screen chips (design.md Decision 7).

import { useEffect, useMemo, useRef } from 'react'
import type { WorldClock } from '@/lib/client-clock'
import type { DrawViewBasis } from '@/lib/space/draw'
import type { SpaceCamera } from './space-camera'
import { hitTargetTransform, projectMarks, viewBasisOf, type ProjectedMark } from './space-projection'
import { buildSceneModel, type SceneInput, type SceneModel } from './space-scene'

/** What `SystemSpaceView` hands the stage: every `SceneInput` field except
 * `worldTimeMs`, which the loop supplies itself, once per frame. */
export type SceneFrameInputs = Omit<SceneInput, 'worldTimeMs'>

/** What `SystemSpaceView` hands the stage. Stable identity (a `useMemo` on
 * `[clock]`) so passing it never invalidates anything keyed on it. */
export interface SpaceFrameSource {
  clock: WorldClock
  inputsRef: { readonly current: SceneFrameInputs | null }
}

/**
 * THE published frame, and the one basis in the view (design.md Decision
 * 7). A NEW object on every publish; never mutated after publishing.
 */
export interface SpaceFrame {
  scene: SceneModel
  /** The camera the basis was built from. */
  camera: SpaceCamera
  basis: DrawViewBasis
  /** Keyed by `mark.id`. */
  projected: ReadonlyMap<string, ProjectedMark>
}

export interface HitTargetRegistry {
  /**
   * A STABLE callback per mark id: `(el) => el ? set(id, el) + onAttach(id,
   * el) : delete(id)`. The cached callback is dropped once it receives
   * `null`, so a later call for the same id is free to return a new one.
   */
  refFor(markId: string): (el: HTMLElement | null) => void
  get(markId: string): HTMLElement | undefined
  entries(): IterableIterator<[string, HTMLElement]>
  readonly size: number
}

export function createHitTargetRegistry(
  onAttach?: (markId: string, el: HTMLElement) => void,
): HitTargetRegistry {
  const elements = new Map<string, HTMLElement>()
  const callbacks = new Map<string, (el: HTMLElement | null) => void>()

  return {
    refFor(markId: string) {
      let cb = callbacks.get(markId)
      if (!cb) {
        cb = (el: HTMLElement | null) => {
          if (el) {
            elements.set(markId, el)
            onAttach?.(markId, el)
          } else {
            elements.delete(markId)
            callbacks.delete(markId)
          }
        }
        callbacks.set(markId, cb)
      }
      return cb
    },
    get(markId: string) {
      return elements.get(markId)
    },
    entries() {
      return elements.entries()
    },
    get size() {
      return elements.size
    },
  }
}

/**
 * Writes `el.style.transform = hitTargetTransform(frame?.projected.get(markId)?.screen)`.
 * With no frame published yet, it writes nothing — the element keeps
 * whatever it was created with, until the loop's first publish reaches it.
 */
export function applyHitTransform(frame: SpaceFrame | null, markId: string, el: HTMLElement): void {
  if (!frame) return
  el.style.transform = hitTargetTransform(frame.projected.get(markId)?.screen)
}

export interface SpaceTransformLoopOptions {
  /** `viewport = host.clientWidth || 1, host.clientHeight || 1`. */
  host: HTMLElement
  registry: HitTargetRegistry
  cameraRef: { readonly current: SpaceCamera }
  /** Written by the loop, read by everyone else. */
  frameRef: { current: SpaceFrame | null }
  /** `null` = publish `staticSceneRef.current` as-is (tests only). */
  source: SpaceFrameSource | null
  staticSceneRef: { readonly current: SceneModel }
  /**
   * Called when the published camera (by identity) or viewport size
   * differs from the last call, including the first publish. Never called
   * merely because a frame passed.
   */
  onViewChange?: (basis: DrawViewBasis) => void
}

export interface TransformLoopHandle {
  stop(): void
  /**
   * Re-runs the projection/write/publish steps synchronously on the LAST
   * BUILT scene. Never calls `buildSceneModel`. If no scene has been built
   * yet, runs a full frame.
   */
  refresh(): void
}

export function startSpaceTransformLoop(options: SpaceTransformLoopOptions): TransformLoopHandle {
  const { host, registry, cameraRef, frameRef, source, staticSceneRef, onViewChange } = options

  let rafId = 0
  let warned = false
  let lastCamera: SpaceCamera | null = null
  let lastWidth = -1
  let lastHeight = -1

  const warnOnce = (err: unknown) => {
    if (warned) return
    warned = true
    // A throw must never escape an animation-frame callback — no React
    // error boundary can reach it there.
    console.warn('[space] transform frame failed', err)
  }

  /** Steps 2–6: project, write, publish. Never builds a scene. */
  const publish = (scene: SceneModel): void => {
    const camera = cameraRef.current
    const width = host.clientWidth || 1
    const height = host.clientHeight || 1
    const basis = viewBasisOf(camera, { width, height })
    const projected = new Map(projectMarks(scene, basis).map((p) => [p.mark.id, p] as const))

    for (const [id, el] of registry.entries()) {
      el.style.transform = hitTargetTransform(projected.get(id)?.screen)
    }

    frameRef.current = { scene, camera, basis, projected }

    if (camera !== lastCamera || width !== lastWidth || height !== lastHeight) {
      lastCamera = camera
      lastWidth = width
      lastHeight = height
      onViewChange?.(basis)
    }
  }

  /** Step 1 + 2–6, in one try/catch. */
  const frame = (): void => {
    try {
      let scene: SceneModel
      if (source) {
        if (!source.inputsRef.current) return
        scene = buildSceneModel({ ...source.inputsRef.current, worldTimeMs: source.clock.now() })
      } else {
        scene = staticSceneRef.current
      }
      publish(scene)
    } catch (err) {
      warnOnce(err)
    }
  }

  const requestNext = (): void => {
    rafId = requestAnimationFrame(() => {
      frame()
      requestNext()
    })
  }

  // One frame runs SYNCHRONOUSLY before the first rAF is requested — chip
  // membership, focus reframing and point picks all read the published
  // frame, and this is what keeps the basis current by the end of the
  // commit that started the loop.
  frame()
  requestNext()

  return {
    stop() {
      cancelAnimationFrame(rafId)
    },
    refresh() {
      const current = frameRef.current
      if (!current) {
        frame()
        return
      }
      try {
        publish(current.scene)
      } catch (err) {
        warnOnce(err)
      }
    },
  }
}

/**
 * Mounts the loop while `enabled && host`. Returns a STABLE control whose
 * `refresh()` is a no-op while the loop is stopped.
 */
export function useSpaceTransformLoop(
  options: Omit<SpaceTransformLoopOptions, 'host'> & { host: HTMLElement | null; enabled: boolean },
): { refresh(): void } {
  const { host, enabled, registry, cameraRef, frameRef, source, staticSceneRef, onViewChange } = options
  const handleRef = useRef<TransformLoopHandle | null>(null)

  useEffect(() => {
    if (!enabled || !host) return
    const handle = startSpaceTransformLoop({
      host,
      registry,
      cameraRef,
      frameRef,
      source,
      staticSceneRef,
      onViewChange,
    })
    handleRef.current = handle
    return () => {
      handle.stop()
      handleRef.current = null
    }
    // cameraRef, frameRef and staticSceneRef are refs — stable identity for
    // the whole mount, so they never belong in this array; onViewChange is a
    // setState function, also stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, host, registry, source])

  return useMemo(
    () => ({
      refresh() {
        handleRef.current?.refresh()
      },
    }),
    [],
  )
}
