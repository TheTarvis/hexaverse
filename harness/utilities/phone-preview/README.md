# Local phone-preview preparation

These utilities prepare an isolated emulator-backed game and static Storybook.
They do not authenticate visitors, launch ngrok, deploy, or create grants. Never
expose the gateway without an approved outer authentication policy. See
[the approval/access plan](../../../docs/phone-preview.md).

Run from repository root with the existing Node installation; no installs needed.
Verify the effective backend emulator project before choosing `--project`. The
examples use the backend config's `hexaverse-emulator`, not production data.
No command below edits `.env` files or migrates emulator users/data.

```sh
node harness/utilities/phone-preview/frontend.mjs build --project hexaverse-emulator
node harness/utilities/phone-preview/storybook.mjs --project hexaverse-emulator
node harness/utilities/phone-preview/frontend.mjs start --project hexaverse-emulator
```

The frontend binds `127.0.0.1:20205`; build output, TypeScript config and cache are
isolated and ignored. It uses `/api`, same-origin Auth emulator routes, no browser
Firestore or analytics. Ordinary development/production defaults stay unchanged.
Static Storybook output is `.storybook/phone-preview-static` beneath `frontend/`.

For **local QA only**, in another terminal:

```sh
node harness/utilities/phone-preview/gateway.mjs --origin http://127.0.0.1:20204
```

Open `http://127.0.0.1:20204/` or `/storybook/`. Exact Origin validation means this
HTTP QA configuration cannot be reused behind an HTTPS tunnel. After separate
approval, stop it and configure the exact approved HTTPS origin instead. The
required external Google OAuth/exact-identity gate is not supplied by this utility.
The gateway binds loopback `20204`, routes only required browser API/Auth calls,
serves confined static Storybook, and denies dev/admin/push/traversal paths.

Local tests (fixture servers bind loopback and shut down):

```sh
node --test harness/utilities/phone-preview/*.test.mjs
```

Chrome verification covered manager navigation, prefixed iframe/JS/images and
world WebGPU rendering with root model URLs. Real HTTPS Google gate/cookies,
emulator login/refresh, SSE through ngrok and iOS remain separate acceptance.
Stop both foreground processes with Ctrl-C after QA. No launch agent or persistent
service is installed; leave ordinary existing development services alone.

## Bounded external window — approval required first

HTTPS mode requires `--until` as an exact UTC ISO timestamp, in the future and
no more than seven days away. The currently proposed weekend cutoff is
`2026-10-19T00:00:00Z` (Sunday October18,20:00 America/New_York), pending the
separate access/identity approval. The earlier60-minute pilot is not a provider
limit and is not the weekend deadline.

After approval and outer Google/exact-email protection are verified, the gateway
shape is:

```sh
node harness/utilities/phone-preview/gateway.mjs --origin https://APPROVED-HOST --until 2026-10-19T00:00:00Z
```

This command does not create a tunnel or authenticate visitors. Never substitute
a bare public forward for the approved outer gate. Expiry closes the listener
and active streams, checks wall-clock deadlines across asynchronous work, and
rejects expired restarts. Stop the owned ngrok/frontend processes too and verify
the exact external URL no longer reaches the app. No service/cron/launch agent
is installed. Mac awake/network availability remains necessary.
