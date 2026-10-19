# Domain documentation

Hexaverse uses one shared game vocabulary in root [GLOSSARY.md](../../GLOSSARY.md).
Before exploring or changing a gameplay domain, read that glossary and the owning
page linked from [docs/README.md](../README.md). Domain pages distinguish settled
intent, current implementation/gaps and proposals; code/tests establish implemented
behavior. Use the glossary's terms consistently in prose, issues, code and tests.
Surface conflicts with accepted intent or decisions rather than silently overriding.

## Updating the model

Record resolved terminology in `GLOSSARY.md` using the imported
[glossary format](../../harness/skills/domain-modeling/GLOSSARY-FORMAT.md).
Keep definitions free of APIs, storage types and implementation decisions.
Record gameplay rules in their existing domain owner; link across domains instead
of copying rules. Follow [document placement](../README.md#where-to-write) for
scratch work and durable guidance.

Create `docs/adr/` lazily for decisions that are costly to reverse, surprising
without context and involve a real trade-off. Read relevant ADRs when present;
flag conflicts explicitly. Use the imported
[ADR format](../../harness/skills/domain-modeling/ADR-FORMAT.md).

The domain pages are topics within the same language. A root `GLOSSARY-MAP.md`
would be appropriate only if separate language contexts emerge, each with its
own glossary; it is not an additional index of the existing domain pages.
