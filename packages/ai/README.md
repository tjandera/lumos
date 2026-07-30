# `@interior/ai`

The AI layer. Pure TypeScript — no three.js, no React — so the same code runs the agentic
loop server-side in `apps/api` and applies the resulting document mutations client-side in
`apps/web`.

```bash
pnpm --filter @interior/ai test
```

## The load-bearing guarantee

**The model never produces a coordinate.**

LLMs are unreliable at spatial reasoning, so they are structurally excluded from the part
that has to be right. The model proposes *constraints and intent* through typed tools
("a two-seat sofa, against the long wall, facing the window"). A deterministic solver turns
that into an actual position, checks it for collisions and clearance, and either commits it
or reports why it couldn't.

Everything else here follows from that split.

## Tools

Seven, with argument schemas derived from the same zod types as `SceneDocument` — so a tool
signature cannot drift from the document it mutates.

| Tool | Does |
| --- | --- |
| `placeFurniture` | Add a catalog item by spatial constraint (near wall, facing an item, in a zone). |
| `moveItem` | Reposition by constraint, not by coordinate. |
| `removeItem` | Delete an item. |
| `setTimeOfDay` | Move the sun. |
| `toggleLamp` | Switch a fixture. |
| `querySpace` | Read the room — dimensions, free space, what's where. |
| `suggestLayout` | Plan a whole room at once. |

## Layout

| Module | Responsibility |
| --- | --- |
| `tools.ts` | Tool schemas (zod) plus the derived JSON Schema the providers consume. |
| `solver.ts` | Constraints → a validated position. The deterministic half. |
| `layout.ts` | `suggestLayout` — whole-room planning. |
| `executor.ts` | Applies a tool call, returning a new immutable document. |
| `catalog.ts` | Catalog types and DB-filter helpers. Shopping is **filter first, rank second**: the database narrows by dimensions, fit-through-door and budget; the model only ranks and explains the shortlist. It cannot invent a product. |
| `provider.ts`, `providers/` | Model-agnostic provider interface, with a mock, an OpenAI Chat Completions client and an OpenAI Responses client. |
| `prompt.ts` | Prompt-injection guard for untrusted text (catalog copy, shared designs). |
| `loop.ts` | The agentic loop: call, execute tools, feed results back. |

## Providers

`MockProvider` is the default and needs no key, no network and no configuration — a
deterministic heuristic responder. It exists so the assistant is never a dead end in a
fresh checkout, and so the loop and executor can be tested without a live model.

A real provider requires explicit configuration (`AI_PROVIDER_BASE_URL` + `AI_MODEL`); it
is never inferred. The Responses-API client is used for the official GPT-5.6 integration
because it supports typed tools reliably; any other OpenAI-compatible endpoint (Azure,
vLLM, LiteLLM, Ollama's shim) takes the Chat Completions path.

## Untrusted text

Catalog descriptions and shared design names are attacker-controllable in a
multi-user deployment. `prompt.ts` guards the text that reaches the model. Treat anything
arriving from storage or a share link as data, never as instruction.
