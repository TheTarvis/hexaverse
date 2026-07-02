# Customer Discovery — Datacenter Energy Storage

You cannot figure out the wedge by reading. You need to talk to people who actually deploy or operate this stuff. This is the playbook.

## Goal

**10 conversations in 30 days.** Each ~30 minutes. Listen 80%, talk 20%. The output isn't a sale — it's a sharper picture of where the real pain is.

## Who to talk to (in priority order)

1. **Datacenter facilities engineers / facility managers** at colos and small-to-mid hyperscalers. They live with the power problems daily. Hardest to find but highest-signal.
2. **Power-systems engineers at integrators** — Vertiv, Schneider, Eaton, Caterpillar, Cummins. They install and commission UPS/BESS. Know what breaks.
3. **Energy-storage deployment engineers** at BESS integrators (Fluence, Tesla, Wartsila, Honeywell). Adjacent but they're starting to chase datacenter contracts.
4. **Energy procurement / strategy people** at hyperscalers (Microsoft, Meta, Google, AWS). Strategic POV, harder to access. LinkedIn-only typically.
5. **Folks at Torus / Revterra / Beacon / Amber** — they could be customers (need orchestration) or competitors (sell their own).
6. **Utility-side people** at AES, Constellation, NextEra, Vistra (the Emerald AI partners). Useful for understanding the utility-of-things side.

## Where to find them

- **LinkedIn search.** Filter by title keywords (`facilities engineer`, `critical infrastructure`, `power infrastructure`, `data center electrical`) and company. Connect with a one-sentence note.
- **Datacenter Dynamics (DCD)** — events, articles, comments. Real practitioners hang out there.
- **Open Compute Project** working groups — power-related ones especially. Join meetings, lurk, then ask questions.
- **AFCOM / 7x24 Exchange** — datacenter operator orgs, conference attendees.
- **Reddit r/datacenter, r/electricians, r/ElectricalEngineering** — operator complaints in the wild.
- **Conferences** if you can swing them: Data Center World (March/April), DCD>Connect events, RE+ (Sep), Energy Storage Association annual.
- **Cold email** is fine. People in operations roles answer cold emails surprisingly often if the ask is clear and short.

## How to ask (the Mom Test)

Read *The Mom Test* by Rob Fitzpatrick. The one-line version: **don't ask people about their opinions of your idea. Ask them about their lives.**

### Bad questions (don't do this)

- "Would you use a tool that orchestrates flywheel + battery + diesel?" → They'll say "sure, sounds great." Worthless.
- "Is this a problem worth solving?" → Polite yes. Worthless.
- "Would you pay $X/month for this?" → Hypothetical. Worthless.

### Good questions (do this)

- "Walk me through the last time the power infrastructure caused you a headache."
- "What's the most annoying thing about your current UPS / BESS / generator setup?"
- "Last time you had to size a storage system, how did you do it?"
- "What did you try before that didn't work? Why didn't it work?"
- "Who else on the team gets pulled in when this comes up?"
- "If you could wave a magic wand, what would actually change?" (only late in the convo)

You want **stories about past behavior**, not opinions about future behavior.

## What to take notes on

- Specific incidents, dates, vendors, dollar amounts.
- Tools they currently use (spreadsheets, vendor portals, custom scripts).
- The names of the *other* people they say have to deal with this.
- Any time they say "we just live with it" or "yeah, that's just how it is" — that's a calcified pain point and a wedge.
- Words and phrases they use. Mirror these later when you write copy.

## After each call

Write a one-page note: who, what they do, what the actual pain is (in their words), what tools they use today, what they tried that didn't work, who they referred you to. **Always ask for a referral** — "who else doing this kind of work would be worth talking to?" That's how the network compounds.

Save these in `interviews/YYYY-MM-DD-firstname-role.md`. Patterns emerge by interview 5–7.

## Red flags that mean "stop building, learn more"

- Three interviews in and you can't repeat back the pain in their words.
- Multiple operators say "we hate X" but X is something Emerald AI / Stem / FlexGen already solves.
- The pain is real but the budget owner is three orgs away from the person feeling it.

## Green flags that mean "keep going"

- Multiple operators independently describe the same workflow gap (e.g., "we size with a Vertiv spreadsheet and it's wrong half the time").
- They volunteer to introduce you to colleagues without prompting.
- They ask "can you send me what you're working on when it's ready?" without you asking.
- A specific dollar number gets mentioned ("we wasted $X on oversizing").

## The simulator's role in all this

Don't pitch the simulator. Build it because building it makes you literate. **Bring screenshots to interviews to ground the conversation.** "I'm modeling stacks like this — does this match your reality?" gets way more signal than "what would you want?"
