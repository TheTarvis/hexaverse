'use client'

// The wake-up flow (#0009): a signed-in account with no corporation names its
// lineage and wakes. Spawn creates the corp + one hull in a frontier system;
// on success the corp query invalidates and the gate flips to the galaxy view,
// where the new fleet is already on station at home.
//
// Diegetic framing (spec / lore): the mind browses from cold storage, then wakes
// into a hull. The screen mirrors the galaxy view's dark canvas so the transition
// into play is seamless.

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { corporationService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import type { SpawnResult } from '@/lib/types/corporation'

export function WakeUpFlow() {
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const spawn = useMutation({
    mutationFn: (n: string) => corporationService.spawn({ name: n }),
    onSuccess: (res: SpawnResult) => {
      // Hint the galaxy view to glide to home once it mounts (best-effort polish;
      // the fleet is visible regardless). Cleared by the view after it focuses.
      if (res.homeSystem?.id) {
        try {
          sessionStorage.setItem('wakeFocus', res.homeSystem.id)
        } catch {
          // sessionStorage may be unavailable (private mode) — non-fatal.
        }
      }
      // Flip the gate: the corp now exists, and the new hull should appear.
      qc.invalidateQueries({ queryKey: queryKeys.corporations.me() })
      qc.invalidateQueries({ queryKey: queryKeys.fleets.all })
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
