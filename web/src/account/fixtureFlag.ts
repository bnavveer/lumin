// `?fixtures=1` renders sample data so the UI can be demoed without a backend.
// The flag sticks for the tab (sessionStorage) so in-app navigation keeps it;
// `?fixtures=0` turns it off. Production code paths never invent data.
const KEY = 'aid.fixtures'

export function fixturesOn(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('fixtures')
    if (q === '1') sessionStorage.setItem(KEY, '1')
    if (q === '0') sessionStorage.removeItem(KEY)
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
