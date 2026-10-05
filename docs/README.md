# Project documentation

A remaster of the Flash game Alien Transporter (Electron + TypeScript + PixiJS + box2dweb). The user guide is in the [root README](../README.md); this folder holds the internal development documentation.

| Document | What it covers |
|---|---|
| [00 — Overview](00-overview.md) | what we are doing and why, the main decisions |
| [01 — Architecture](01-architecture.md) | layers, processes, data flows |
| [02 — SWF extraction](02-extraction-pipeline.md) | how the assets are produced from your own SWF (they are not in the repository) |
| [03 — Frame and network](03-frame-and-network-protocol.md) | the frame format, the LAN play protocol |
| [04 — Porting guide](04-porting-guide.md) | the rules for porting AS3 → TypeScript (integer semantics, PRNG, etc.) |
| [05 — Verification](05-verification.md) | tests, parity check with the original, performance budgets |
| [06 — LAN verification](06-lan-testing.md) | how to test network play, measurement results |
| [08 — Windows measurement](08-windows-measure-handoff.md) | a step-by-step guide to measuring performance on a laptop |

## How the work was done

The project was built task by task (task cards in [`tasks/`](tasks/)) with dependencies from the [ROADMAP](ROADMAP.md); the current state is in [STATUS](STATUS.md). How the agents were run: [ORCHESTRATION](ORCHESTRATION.md). Rules for the agents: [`../CLAUDE.md`](../CLAUDE.md).

> The original assets (graphics, sound, levels) belong to Anton Karlov and are not part of the repository: they are obtained with the `npm run extract` command from your own SWF.
