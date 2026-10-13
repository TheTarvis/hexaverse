'use client'

// FleetActionsPanel — the acting fleet's own-state-anchored command surface
// (openspec change `build-production-space-view`, capability
// `docked-fleet-actions`): mine, sell, refuel, the station-keeping
// hold/release pair, the cargo-hold and credit readouts, and the two burn-
// ending verbs.
//
// EVERY OFFER IS ANCHORED TO THE FLEET'S OWN SERVED STATE, never to a canvas
// selection: you can only mine, sell or refuel where the fleet physically
// is. That is what keeps this panel fully usable while the canvas is
// unavailable and while the interior read has failed — the states in which
// a selection does not exist at all.
//
// NOTHING HERE IS DERIVED WHERE THE SERVER ALREADY SERVES IT: the mining
// rate, the fuel price, the station-keeping upkeep rate and the credit
// balance are all rendered as served. In particular the upkeep rate is
// NEVER recomputed from a body's radius and period — `space.StationKeepRate`
// is rule-bearing (a floor clamp and a non-positive-period branch) and a
// client copy of it is the mirror `space-kinematics` forbids.

import { HudPanel } from '@/components/hud/GameHud'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/catalyst/badge'
import { Button } from '@/components/catalyst/button'
import { Figure } from '@/components/figure/Figure'
import { Input } from '@/components/catalyst/input'
import { useCancelAction, useRunningMine } from '@/hooks/use-actions'
import { useCutDrive, useHold, useMine, useRelease, useStop } from '@/hooks/use-fleets'
import { useRefuel, useSell } from '@/hooks/use-market'
import { useSubmitGuard } from '@/hooks/use-submit-guard'
import { formatByUnit } from '@/lib/format'
import { firstTonPrice, foldSale } from '@/lib/market/fold'
import { GENERIC_SALE_FAILURE, isPriceChanged, saleErrorCopy } from '@/lib/market-copy'
import { refuelErrorCopy } from '@/lib/refuel-copy'
import {
  burnErrorCopy,
  commandErrorReason,
  holdErrorCopy,
  mineErrorCopy,
  releaseErrorCopy,
} from '@/lib/rejection-copy'
import { newOperationKey } from '@/lib/services/market-service'
import { toast } from '@/lib/toast'
import { PARK_KIND_ORBIT, PARK_KIND_STATIONKEEP, type Fleet } from '@/lib/types/fleet'
import type { GuideSale, GuideRefuel } from '@/lib/command-onboarding'
import type { Station, VenueQuotes } from '@/lib/types/market'
import type { ResourceDeposit, ResourceKind } from '@/lib/types/system-space'

export interface DockedFeature {
  id: string
  type: string
  resources?: ResourceDeposit[]
}

export interface FleetActionsPanelProps {
  /** The acting fleet. */
  fleet: Fleet | null
  /**
   * The body the fleet is docked to, from the INTERIOR read. Null when that
   * read failed — which withdraws the mine offer without misreporting the
   * body, since resource kinds reach this view only on that read.
   */
  dockedFeature: DockedFeature | null
  interiorFailed: boolean
  station: Station | null
  stationQuotes: VenueQuotes | null
  credits: number | null
  canvasAvailable: boolean
  worldTime: number
  /** The mounting view's served world-clock scale — see contract §6. */
  scale: number | undefined
  onSaleAccepted?: (sale: GuideSale) => void
  onRefuelAccepted?: (purchase: GuideRefuel) => void
  tutorialSample?: boolean
  onMineAccepted?: (accepted: { fleetId: string; featureId: string; actionId: string; kind: ResourceKind; tons: number; cargoBefore: number }) => void
}

const SECTION = 'mt-3 border-t border-dashed border-white/15 pt-3'
const LABEL = 'font-mono text-[11px] font-medium tracking-wide text-zinc-400 uppercase'

function clampTons(raw: string, max: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.min(parsed, max)
}

export function FleetActionsPanel({
  fleet,
  dockedFeature,
  interiorFailed,
  station,
  stationQuotes,
  credits,
  worldTime,
  scale,
  tutorialSample = false,
  onMineAccepted,
  onSaleAccepted,
  onRefuelAccepted,
}: FleetActionsPanelProps) {
  const fleetId = fleet?.id ?? ''
  const systemId = fleet?.systemId ?? ''
  const roster = fleet?.roster
  const held = useMemo(() => roster?.cargo ?? {}, [roster?.cargo])
  const freeHold = roster?.freeHold ?? 0

  const mine = useMine(systemId)
  const sell = useSell(systemId)
  const refuel = useRefuel(fleetId)
  const hold = useHold()
  const release = useRelease()
  const cutDrive = useCutDrive()
  const stop = useStop()
  const cancelAction = useCancelAction(systemId)
  const running = useRunningMine(fleetId || null).data ?? null

  // One shared synchronous guard per control. The guard is released on
  // EVERY terminal callback — `onSettled` is React Query's own, and the
  // success/error releases keep a caller that resolves through those alone
  // from latching the control permanently.
  const mineGuard = useSubmitGuard()
  const sellGuard = useSubmitGuard()
  const refuelGuard = useSubmitGuard()

  // The one place a command failure becomes visible to assistive technology.
  // A purely visual toast is not enough.
  const [errorAnnouncement, setErrorAnnouncement] = useState('')
  const reportFailure = (message: string) => {
    toast.error(message)
    setErrorAnnouncement(message)
  }

  // --- mine ---------------------------------------------------------------
  const mineable = useMemo(
    () => (dockedFeature?.resources ?? []).filter((r) => r.kind),
    [dockedFeature?.resources],
  )
  const docked = !!fleet?.attachedTo
  const dockedHere = docked && dockedFeature?.id === fleet?.attachedTo
  const mineOffered = !interiorFailed && dockedHere && mineable.length > 0

  // THE STATION, not bare attachment, anchors the two market verbs
  // (`docked-fleet-actions`: "Sell is not offered while docked to a body
  // that is not the station", "Refuel is not offered while docked to a body
  // that is not the station"). Offering them off `attachedTo` alone put a
  // sell control on every rock in the system, and `commitSell` returned
  // early on the missing station — a control that failed silently under the
  // player's hand.
  const dockedAtStation = !!station && !!fleet?.attachedTo && fleet.attachedTo === station.featureId

  const richest = useMemo(
    () => [...mineable].sort((a, b) => b.richness - a.richness)[0]?.kind ?? null,
    [mineable],
  )
  const [mineKind, setMineKind] = useState<ResourceKind | null>(null)
  const activeMineKind = mineKind && mineable.some((r) => r.kind === mineKind) ? mineKind : richest
  const [mineTons, setMineTons] = useState<number>(freeHold)
  const sampleDefaulted = useRef(false)
  useEffect(() => {
    if (tutorialSample && !sampleDefaulted.current && freeHold >= 1) {
      // A suggested sample, not a client-side minimum; the server validates runs.
      setMineTons(Math.min(10, freeHold))
      sampleDefaulted.current = true
    }
    if (!tutorialSample) sampleDefaulted.current = false
  }, [tutorialSample, freeHold])
  const [committedEta, setCommittedEta] = useState<number | null>(null)

  const mineEta = running ?? (committedEta ? { id: '', eta: committedEta } : null)
  const mineRunning = !!mineEta && mineEta.eta > worldTime

  const miningRate = roster?.miningRate ?? 0
  const minePreviewMs = miningRate > 0 ? mineTons / miningRate : 0

  const commitMine = () => {
    if (!fleet || !dockedFeature || !activeMineKind) return
    // Synchronously, within THIS invocation — never a state flip that
    // reaches `disabled` a render later.
    if (!mineGuard.claim()) return
    const cargoBefore = held[activeMineKind] ?? 0
    mine.mutate(
      { fleetId: fleet.id, request: { featureId: dockedFeature.id, kind: activeMineKind, tons: mineTons } },
      {
        onSuccess: (result: { actionId?: string; eta?: number } | undefined) => {
          mineGuard.release()
          if (typeof result?.eta === 'number') setCommittedEta(result.eta)
          if (result?.actionId) onMineAccepted?.({ fleetId: fleet.id, featureId: dockedFeature.id, actionId: result.actionId, kind: activeMineKind, tons: mineTons, cargoBefore })
          toast.success('Mining run committed.')
        },
        onError: (error: unknown) => {
          mineGuard.release()
          reportFailure(mineErrorCopy(commandErrorReason(error)))
        },
        onSettled: () => mineGuard.release(),
      },
    )
  }

  // --- sell ---------------------------------------------------------------
  // Memoised: `?? []` would mint a fresh array every render, so every memo
  // downstream of it would recompute every time.
  const quotes = useMemo(() => stationQuotes?.quotes ?? [], [stationQuotes?.quotes])
  const sellable = useMemo(
    () =>
      quotes
        .filter((q) => (held[q.kind] ?? 0) > 0 && firstTonPrice(q.entries) > 0)
        .sort((a, b) => (held[b.kind] ?? 0) - (held[a.kind] ?? 0)),
    [quotes, held],
  )
  const hasCargo = Object.values(held).some((tons) => (tons ?? 0) > 0)
  // The quotes are load-bearing for the picker and the proceeds preview, so
  // a withdrawn board withdraws the offer with them (the mounting view
  // attributes the absence; see `system-space-view`'s fan-in).
  const sellOffered = dockedAtStation && hasCargo && !!stationQuotes

  const [sellKind, setSellKind] = useState<ResourceKind | null>(null)
  const activeSellKind =
    sellKind && sellable.some((q) => q.kind === sellKind) ? sellKind : (sellable[0]?.kind ?? null)
  const sellHeld = activeSellKind ? (held[activeSellKind] ?? 0) : 0
  const [sellTons, setSellTons] = useState<number>(0)
  // What the player was quoted at commit time (`sellPreview.totalProceeds`,
  // captured — the same fold `sell-proceeds-preview` was showing, never a
  // flat tons × price re-derivation) versus what the CURRENT fold now says —
  // the two figures `sell-price-changed` compares (contract §4).
  const [priceChange, setPriceChange] = useState<{ expectedTotal: number } | null>(null)

  const sellEntries = useMemo(
    () => quotes.find((q) => q.kind === activeSellKind)?.entries ?? [],
    [quotes, activeSellKind],
  )
  const sellPreview = useMemo(() => foldSale(sellEntries, sellTons), [sellEntries, sellTons])

  // Re-default the tonnage when the kind, or what is aboard, changes.
  const lastSellKind = useRef<ResourceKind | null>(null)
  useEffect(() => {
    if (lastSellKind.current !== activeSellKind) {
      lastSellKind.current = activeSellKind
      setSellTons(sellHeld)
    } else if (sellTons > sellHeld) {
      setSellTons(sellHeld)
    }
  }, [activeSellKind, sellHeld, sellTons])

  const commitSell = () => {
    if (!fleet || !station || !activeSellKind) return
    // BEFORE the operation key is minted: two activations in one tick must
    // mint ONE key, or server-side idempotency-by-key structurally cannot
    // dedup them and the player is charged twice.
    if (!sellGuard.claim()) return
    const operationKey = newOperationKey()
    const expectedUnitPrice = firstTonPrice(sellEntries)
    // The fold's total that was ON SCREEN at commit time (`sell-proceeds-preview`),
    // captured — not tons × price. Proceeds are a fold across entries, not a
    // flat multiply (`docked-fleet-actions`: *A split-fill preview matches the
    // settlement fold exactly*), so the figure the player compares against must
    // be the one they actually saw.
    const expectedTotal = sellPreview.totalProceeds
    sell.mutate(
      {
        fleetId: fleet.id,
        request: {
          featureId: station.featureId,
          kind: activeSellKind,
          tons: sellTons,
          operationKey,
          expectedUnitPrice,
        },
      },
      {
        onSuccess: (result) => {
          onSaleAccepted?.({ fleetId: fleet.id, featureId: station.featureId, kind: activeSellKind, result })
          sellGuard.release()
          setPriceChange(null)
          toast.success('Sale settled.')
        },
        onError: (error: unknown) => {
          sellGuard.release()
          const reason = commandErrorReason(error)
          if (isPriceChanged(reason)) setPriceChange({ expectedTotal })
          reportFailure(reason ? saleErrorCopy(reason) : GENERIC_SALE_FAILURE)
        },
        onSettled: () => sellGuard.release(),
      },
    )
  }

  // --- refuel -------------------------------------------------------------
  const fuelPrice = roster?.fuelPricePerTon ?? 0
  // With no balance to divide by the price there is nothing to cap against,
  // so the default falls back to the fleet's full free hold rather than to
  // zero — a missing balance withdraws a readout, never a verb.
  const affordableTons =
    fuelPrice > 0 && credits !== null ? Math.floor(credits / fuelPrice) : freeHold
  const defaultRefuelTons = Math.max(0, Math.min(freeHold, affordableTons))
  const [refuelTons, setRefuelTons] = useState<number>(defaultRefuelTons)
  const refuelOffered = dockedAtStation

  const commitRefuel = () => {
    if (!fleet) return
    if (!refuelGuard.claim()) return
    const operationKey = newOperationKey()
    refuel.mutate(
      { fleetId: fleet.id, request: { tons: refuelTons, operationKey } },
      {
        onSuccess: (result) => {
          if (station) onRefuelAccepted?.({ fleetId: fleet.id, featureId: station.featureId, fuelBefore: held.fuel ?? 0, result })
          refuelGuard.release()
          toast.success('Refuelled.')
        },
        onError: (error: unknown) => {
          refuelGuard.release()
          reportFailure(refuelErrorCopy(commandErrorReason(error)))
        },
        onSettled: () => refuelGuard.release(),
      },
    )
  }

  // --- station-keeping ----------------------------------------------------
  const park = fleet?.state?.Mode === 1 ? fleet.state.Park : null
  // Offered by EFFECTIVE PARK MODE, and only for the two modes it means
  // anything in: an orbit park can take a hold, a station-keep hold can be
  // released. A burn, a drift and a point park have neither.
  const parkMode: 'orbit' | 'stationkeep' | null =
    park?.Kind === PARK_KIND_ORBIT ? 'orbit' : park?.Kind === PARK_KIND_STATIONKEEP ? 'stationkeep' : null
  const upkeepRate = roster?.stationKeepRateTonsPerSecond

  const submitHold = () => {
    if (!fleet) return
    hold.mutate(fleet.id, {
      onError: (error: unknown) => reportFailure(holdErrorCopy(commandErrorReason(error))),
    })
  }
  const submitRelease = () => {
    if (!fleet) return
    release.mutate(fleet.id, {
      onError: (error: unknown) => reportFailure(releaseErrorCopy(commandErrorReason(error))),
    })
  }

  if (!fleet) {
    return (
      <HudPanel as="aside" data-testid="space-fleet-panel" className="flex w-72 max-w-[85vw] flex-col">
        <p className="text-[11px] text-zinc-500">No fleet selected.</p>
      </HudPanel>
    )
  }

  return (
    <HudPanel as="aside"
      data-testid="space-fleet-panel"
      className="flex w-72 max-w-full flex-col self-start p-3"
    >
      {/* The credit-balance readout and the cargo-hold readout RE-HOMED to
          the vitals strip (openspec change `add-vitals-strip`, RULING 7 —
          no coexistence): `system-console`'s *The Credits Cell...* / *The
          Hold Cell...* now own `balance-readout`/`balance-value`/
          `balance-figure`/`balance-live-region` and
          `hold-readout`/`hold-capacity`/`hold-<kind>`/`hold-free`. The
          `credits` prop STAYS here (refuel's affordable default, impl
          contract §8.3) even though it is no longer rendered. `held` and
          `freeHold` stay too — mine/sell/refuel still read them. */}
      <span className="sr-only" role="status" aria-live="assertive" data-testid="panel-error-live-region">
        {errorAnnouncement}
      </span>

      {/* -------------------------------------------------------- mine */}
      {mineOffered && activeMineKind && (
        <div data-testid="mine-section" className={SECTION}>
          <div className="flex items-center justify-between">
            <span className={LABEL}>Mine</span>
            <Badge color="cyan">DOCKED</Badge>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              data-testid="mine-kind-select"
              aria-label="Resource kind"
              className="rounded-md border border-zinc-700/60 bg-transparent px-1 py-0.5 font-mono text-[11px]"
              value={activeMineKind}
              onChange={(e) => setMineKind(e.target.value as ResourceKind)}
            >
              {mineable.map((r) => (
                <option key={r.kind} value={r.kind}>
                  {r.kind}
                </option>
              ))}
            </select>
            <Input
              data-testid="mine-tons-input"
              aria-label="Tons to mine"
              type="number"
              value={String(mineTons)}
              onChange={(e) => setMineTons(clampTons(e.target.value, freeHold))}
            />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            About{' '}
            <Figure
              raw={minePreviewMs}
              unit="world-ms-span-bare"
              text={formatByUnit(minePreviewMs, scale, 'world-ms-span-bare')}
              data-testid="mine-eta-preview"
            />{' '}
            at the served rate
          </p>
          <Button
            type="button"
            data-testid="mine-button"
            color="dark/zinc"
            className="mt-2 w-full"
            disabled={mineTons <= 0 || mineRunning}
            onClick={commitMine}
          >
            Mine
          </Button>
        </div>
      )}
      {interiorFailed && (
        <div data-testid="mine-unavailable" className={`${SECTION} text-[11px] text-zinc-500`}>
          The system read failed, so this body&apos;s resources are unavailable. Retry the read to
          mine here.
        </div>
      )}
      {mineRunning && mineEta && (
        <div className={`${SECTION} flex items-center justify-between`}>
          <Figure
            raw={mineEta.eta - worldTime}
            unit="world-ms-span-left"
            text={formatByUnit(mineEta.eta - worldTime, scale, 'world-ms-span-left')}
            data-testid="mine-countdown"
            className="font-mono text-[11px] text-sky-400"
          />
          <button
            type="button"
            data-testid="mine-cancel"
            className="rounded-md border border-zinc-700/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-300"
            onClick={() =>
              cancelAction.mutate(
                { actionId: mineEta.id, fleetId: fleet.id },
                { onError: (error: unknown) => reportFailure(mineErrorCopy(commandErrorReason(error))) },
              )
            }
          >
            Cancel
          </button>
        </div>
      )}

      {/* -------------------------------------------------------- sell */}
      {sellOffered && (
        <div data-testid="sell-section" className={SECTION}>
          <div className="flex items-center justify-between">
            <span className={LABEL}>Sell</span>
            <Badge color="cyan">DOCKED</Badge>
          </div>
          {priceChange !== null && (
            <p data-testid="sell-price-changed" className="mt-1 text-[11px] text-amber-500">
              The price moved while you were deciding — you expected{' '}
              <Figure
                raw={priceChange.expectedTotal}
                unit="credits"
                text={formatByUnit(priceChange.expectedTotal, scale, 'credits')}
                data-testid="sell-price-expected"
              />
              , the new offer is{' '}
              <Figure
                raw={sellPreview.totalProceeds}
                unit="credits"
                text={formatByUnit(sellPreview.totalProceeds, scale, 'credits')}
                data-testid="sell-price-refreshed"
              />
              .
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <select
              data-testid="sell-kind-select"
              aria-label="Cargo kind"
              className="rounded-md border border-zinc-700/60 bg-transparent px-1 py-0.5 font-mono text-[11px]"
              value={activeSellKind ?? ''}
              onChange={(e) => setSellKind(e.target.value as ResourceKind)}
            >
              {sellable.map((q) => (
                <option key={q.kind} value={q.kind}>
                  {q.kind}
                </option>
              ))}
            </select>
            <Input
              data-testid="sell-tons-input"
              aria-label="Tons to sell"
              type="number"
              value={String(sellTons)}
              onChange={(e) => setSellTons(clampTons(e.target.value, sellHeld))}
            />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            <Figure
              raw={sellPreview.totalProceeds}
              unit="credits"
              text={formatByUnit(sellPreview.totalProceeds, scale, 'credits')}
              data-testid="sell-proceeds-preview"
            />
          </p>
          <Button
            type="button"
            data-testid="sell-button"
            color="dark/zinc"
            className="mt-2 w-full"
            disabled={!activeSellKind || sellTons <= 0}
            onClick={commitSell}
          >
            Sell
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------ refuel */}
      {refuelOffered && (
        <div data-testid="refuel-section" className={SECTION}>
          <div className="flex items-center justify-between">
            <span className={LABEL}>Refuel</span>
            <Badge color="cyan">DOCKED</Badge>
          </div>
          <Input
            data-testid="refuel-tons-input"
            aria-label="Tons of fuel"
            type="number"
            className="mt-2"
            value={String(refuelTons)}
            onChange={(e) => setRefuelTons(clampTons(e.target.value, freeHold))}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            <Figure
              raw={refuelTons * fuelPrice}
              unit="credits"
              text={formatByUnit(refuelTons * fuelPrice, scale, 'credits')}
              data-testid="refuel-cost-preview"
            />{' '}
            at the served price
          </p>
          <Button
            type="button"
            data-testid="refuel-button"
            color="dark/zinc"
            className="mt-2 w-full"
            disabled={refuelTons <= 0}
            onClick={commitRefuel}
          >
            Refuel
          </Button>
        </div>
      )}

      {/* --------------------------------------------- station-keeping */}
      {parkMode && (
        <div className={SECTION}>
          <button
            type="button"
            data-testid="stationkeep-control"
            className="w-full rounded-md border border-zinc-700/60 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-zinc-300 hover:text-white"
            onClick={parkMode === 'orbit' ? submitHold : submitRelease}
          >
            {parkMode === 'orbit' ? 'Hold here' : 'Resume orbit'}
          </button>
          {upkeepRate !== undefined && (
            // Rendered on BOTH park modes the field is served for: the live
            // drain while holding, and what holding WOULD cost before it is
            // taken.
            <p className="mt-1 text-[11px] text-zinc-500">
              {parkMode === 'stationkeep' ? 'Drain' : 'Holding costs'}{' '}
              <Figure
                raw={upkeepRate}
                unit="tons-per-world-s"
                text={formatByUnit(upkeepRate, scale, 'tons-per-world-s')}
                data-testid="stationkeep-rate"
              />
            </p>
          )}
        </div>
      )}

      {/* TODO(HUD-HIDDEN-CLEANUP): Cut drive / Stop and their otherwise empty panel shell are CSS-hidden in the live system HUD. Retire this row and unused hooks after replacement controls land; retain resource actions. */}
      <div data-testid="fleet-flight-controls" className={`${SECTION} flex gap-2`}>
        <Button
          type="button"
          data-testid={`fleet-cmd-cut-drive-${fleet.id}`}
          color="dark/zinc"
          className="flex-1"
          disabled={mineRunning}
          onClick={() =>
            cutDrive.mutate(fleet.id, {
              onError: (error: unknown) => reportFailure(mineErrorCopy(commandErrorReason(error))),
            })
          }
        >
          Cut drive
        </Button>
        <Button
          type="button"
          data-testid={`fleet-cmd-stop-${fleet.id}`}
          color="dark/zinc"
          className="flex-1"
          disabled={mineRunning}
          onClick={() =>
            stop.mutate(fleet.id, {
              onError: (error: unknown) => reportFailure(burnErrorCopy(commandErrorReason(error))),
            })
          }
        >
          Stop
        </Button>
      </div>
    </HudPanel>
  )
}

export default FleetActionsPanel
