// formatEta renders a world-ms duration as a compact countdown — "45s", "2m",
// "3h 20m", and "now" once it's due. The shared label for every live ETA the UI
// shows (route previews, transit rows, the fleet roster): world time runs at
// scale 1 today, so world-ms are real ms.

export function formatEta(ms: number): string {
  if (ms <= 0) return 'now'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
