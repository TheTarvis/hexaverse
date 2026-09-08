/**
 * users — create / find / list / delete emulator users and get tokens or a
 * browser login URL for them, on either LOCAL cluster.
 *
 *   npm run users -- <command> [--cluster dev|test] [--email E] [--password P] [--uid U] [--json]
 *
 * Commands
 *   ensure      create the user if absent (idempotent); prints its uid
 *   bootstrap   ensure + create the BACKEND account document (POST /v1/accounts) the
 *               app itself creates on first sign-in — without it every game route
 *               sees no actor (spawn 403s). Idempotent. This is the one to run first.
 *   find        look a user up by --email or --uid
 *   list        every user in the cluster
 *   delete      remove a user by --uid (or --email)
 *   token       an ID token for --email/--password — `Authorization: Bearer …` for the backend
 *   login-url   a one-shot URL that signs the BROWSER in as the user (by --uid or --email)
 *               through the dev-only /dev/login route — no password typed anywhere
 *
 * `--cluster` defaults to dev (the stack `npm run dev` uses). `--email` /
 * `--password` default to the cluster's own default user
 * (`config/clusters.ts`: dev@hexaverse.test on dev, the Playwright user on
 * test). `--json` prints machine-readable output for scripting.
 *
 * Shares every helper with the Playwright auth setup
 * (`helpers/firebase-emulator.ts`) — this file is only argument parsing and
 * printing. Emulator only: it has no path to real Firebase Auth.
 */
import { emulatorClusterConfig, isEmulatorCluster, type ClusterConfig } from '../config/env'
import {
  deleteEmulatorUser,
  emulatorSignIn,
  ensureEmulatorUser,
  findEmulatorUser,
  listEmulatorUsers,
  mintEmulatorCustomToken,
  type EmulatorUser,
} from '../helpers/firebase-emulator'

type Command = 'ensure' | 'bootstrap' | 'find' | 'list' | 'delete' | 'token' | 'login-url'
const COMMANDS: Command[] = ['ensure', 'bootstrap', 'find', 'list', 'delete', 'token', 'login-url']

interface Args {
  command: Command
  cluster: 'dev' | 'test'
  email?: string
  password?: string
  uid?: string
  json: boolean
}

function usage(): never {
  console.error(
    `usage: npm run users -- <${COMMANDS.join('|')}> [--cluster dev|test] [--email E] [--password P] [--uid U] [--json]`,
  )
  process.exit(2)
}

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv
  if (!command || !COMMANDS.includes(command as Command)) usage()
  const args: Args = { command: command as Command, cluster: 'dev', json: false }
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]
    const value = rest[i + 1]
    switch (flag) {
      case '--cluster':
        if (!isEmulatorCluster(value)) usage()
        args.cluster = value
        i++
        break
      case '--email':
        if (!value) usage()
        args.email = value
        i++
        break
      case '--password':
        if (!value) usage()
        args.password = value
        i++
        break
      case '--uid':
        if (!value) usage()
        args.uid = value
        i++
        break
      case '--json':
        args.json = true
        break
      default:
        usage()
    }
  }
  return args
}

function describe(u: EmulatorUser): string {
  const provider = u.providerUserInfo?.map((p) => p.providerId).join(',') || (u.customAuth ? 'custom' : 'password')
  return `${u.localId}  ${u.email ?? '(no email)'}  [${provider}]${u.displayName ? `  ${u.displayName}` : ''}`
}

async function resolveUid(cfg: ClusterConfig, args: Args): Promise<string> {
  if (args.uid) return args.uid
  const email = args.email ?? cfg.user.email
  const user = await findEmulatorUser(cfg.emulator, { email })
  if (!user) throw new Error(`no user with email ${email} on the ${cfg.cluster} cluster`)
  return user.localId
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const cfg = emulatorClusterConfig(args.cluster)
  const email = args.email ?? cfg.user.email
  const password = args.password ?? cfg.user.password
  const out = (human: string, json: unknown) => console.log(args.json ? JSON.stringify(json) : human)

  // Fail fast with a useful message when the cluster's auth emulator is down.
  try {
    await fetch(`http://${cfg.emulator.host}:${cfg.emulator.authPort}/`)
  } catch {
    throw new Error(
      `the ${args.cluster} auth emulator is not reachable at ${cfg.emulator.host}:${cfg.emulator.authPort} ` +
        `(start it: npm run firebase:emulators${args.cluster === 'test' ? ':test' : ''} at the repo root)`,
    )
  }

  switch (args.command) {
    case 'ensure': {
      const { localId, created } = await ensureEmulatorUser(cfg.emulator, email, password)
      out(`${created ? 'created' : 'exists'}  ${localId}  ${email}  (${args.cluster})`, {
        cluster: args.cluster,
        uid: localId,
        email,
        created,
      })
      return
    }
    case 'bootstrap': {
      const { localId, created } = await ensureEmulatorUser(cfg.emulator, email, password)
      const { idToken } = await emulatorSignIn(cfg.emulator, email, password)
      // The same call the account provider makes on first sign-in
      // (`accountService.createAccount`), so the document is byte-identical
      // to one the UI would have created.
      const local = email.split('@')[0] ?? 'user'
      const res = await fetch(`${cfg.apiURL}/v1/accounts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: local, nickname: local, email, email_verified: false }),
      })
      const accountCreated = res.status === 201 || res.status === 200
      // The backend answers a duplicate with 400 "Account already created."
      const accountExists =
        res.status === 409 ||
        (res.status === 400 && /already created/i.test(await res.clone().text()))
      if (!accountCreated && !accountExists) {
        throw new Error(
          `POST ${cfg.apiURL}/v1/accounts answered ${res.status} — is the ${args.cluster} backend up?`,
        )
      }
      out(
        `${created ? 'created' : 'exists'}  ${localId}  ${email}  (${args.cluster})  account ${accountExists ? 'exists' : 'created'}`,
        { cluster: args.cluster, uid: localId, email, created, account: accountExists ? 'exists' : 'created' },
      )
      return
    }
    case 'find': {
      const user = args.uid
        ? await findEmulatorUser(cfg.emulator, { localId: args.uid })
        : await findEmulatorUser(cfg.emulator, { email })
      if (!user) {
        out(`not found on ${args.cluster}: ${args.uid ?? email}`, { cluster: args.cluster, found: false })
        process.exitCode = 1
        return
      }
      out(describe(user), { cluster: args.cluster, found: true, user })
      return
    }
    case 'list': {
      const users = await listEmulatorUsers(cfg.emulator)
      out(
        users.length ? users.map(describe).join('\n') : `(no users on ${args.cluster})`,
        { cluster: args.cluster, users },
      )
      return
    }
    case 'delete': {
      const uid = await resolveUid(cfg, args)
      await deleteEmulatorUser(cfg.emulator, uid)
      out(`deleted  ${uid}  (${args.cluster})`, { cluster: args.cluster, uid, deleted: true })
      return
    }
    case 'token': {
      const { idToken, localId } = await emulatorSignIn(cfg.emulator, email, password)
      out(idToken, { cluster: args.cluster, uid: localId, email, idToken, apiURL: cfg.apiURL })
      return
    }
    case 'login-url': {
      const uid = await resolveUid(cfg, args)
      const token = mintEmulatorCustomToken(uid)
      // The token rides the FRAGMENT so it never reaches the dev server's
      // request log; the page reads window.location.hash.
      const url = `${cfg.frontendURL}/dev/login#token=${token}`
      out(url, { cluster: args.cluster, uid, url })
      return
    }
  }
}

main().catch((err: unknown) => {
  console.error(`[users] ${(err as Error).message}`)
  process.exit(1)
})
