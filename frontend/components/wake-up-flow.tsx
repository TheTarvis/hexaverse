'use client'

// The wake-up flow (#0009): a signed-in account with no corporation names its
// lineage and wakes. Spawn creates the corp + one hull in a frontier system;
// on success the corp query invalidates (flipping the wake gate) and the new
// player is routed straight into their home system's hex board — the board is
// where you act (#0007), so a new player starts on it, with the galaxy a click
// away. (The galaxy still consumes the wakeFocus hint to centre home on a later
// visit.)
//
// Diegetic framing (spec / lore): the mind browses from cold storage, then wakes
// into a hull. The screen mirrors the game's dark canvas so the transition into
// play is seamless.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { corporationService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import type { SpawnResult } from '@/lib/types/corporation'

export function WakeUpFlow() {
  const qc = useQueryClient()
  const router = useRouter()
  const [name, setName] = useState('')

  const spawn = useMutation({
    mutationFn: (n: string) => corporationService.spawn({ name: n }),
    onSuccess: (res: SpawnResult) => {
      if (res.homeSystem?.id) {
        // Flip the gate: the corp now exists, and the new hull should appear.
        // Guarded inside this branch (D5) so a malformed response (no home
        // system id) does not flip the gate and unmount this flow before a
        // resubmission is possible.
        qc.invalidateQueries({ queryKey: queryKeys.corporations.me() })
        qc.invalidateQueries({ queryKey: queryKeys.fleets.all })
        // Hint the galaxy view to glide to home if the player opens it later
        // (best-effort polish; cleared by the view after it focuses).
        try {
          sessionStorage.setItem('wakeFocus', res.homeSystem.id)
        } catch {
          // sessionStorage may be unavailable (private mode) — non-fatal.
        }
        // Drop the new player straight into their home system's hex board: once
        // the gate flips (corp resolves), this route renders the board, not the
        // galaxy. No galaxy flash — the wake gate holds the screen until then.
        router.push(`/systems/${res.homeSystem.id}`)
      } else {
        // Malformed success (no home system id): withhold the invalidation
        // and wake-focus write so the gate does not flip and the flow stays
        // mounted and resubmittable — a retriable error, not a silent drop
        // onto the galaxy (D5).
        toast.error('The hull failed to boot. Try again.')
      }
    },
  })

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && !spawn.isPending

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    spawn.mutate(trimmed, {
      onError: (err) => toast.error((err as Error).message || 'The hull failed to boot. Try again.'),
    })
  }

  return (
    <div
      data-testid="wake-up-flow"
      className="relative grid h-dvh w-full place-items-center overflow-hidden bg-[#05070d] px-6 text-white"
    >
      <div className="w-full max-w-md">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">Cold storage · seed archive</p>
        <h1 className="text-2xl font-semibold text-white">A mind wakes in a hull.</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          You are an uploaded consciousness at the frontier&apos;s edge. Name your lineage — every
          fleet you ever field is a drifted copy of you — and wake into your first ship.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
          <Input
            data-testid="wake-name-input"
            aria-label="Corporation name"
            placeholder="Name your lineage"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={60}
            disabled={spawn.isPending}
          />
          <Button type="submit" color="cyan" disabled={!canSubmit} data-testid="wake-submit">
            {spawn.isPending ? 'Waking…' : 'Wake'}
          </Button>
        </form>
      </div>
    </div>
  )
}
