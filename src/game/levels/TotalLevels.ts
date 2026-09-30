// Not a port of a single file: the value of `LevelManager.TOTAL_LEVELS` (ru/alientransporter/levels/LevelManager.as)
// in a module of its own. GameData needs it, and GameData is imported by G, which must not import LevelManager:
// LevelManager -> LevelCore -> Factory / nodes -> components -> G would close an ES module cycle in which a
// node class reads a component class before it exists (see the note in G.ts).

export const TOTAL_LEVELS = 20; // int
