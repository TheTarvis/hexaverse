export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const token = params.get('token')
  return token && token.length > 0 ? token : null
}
