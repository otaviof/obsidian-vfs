import { parseExpansionInput, handleExpansion } from "./expansion-handler.js";
import { runHookEntry } from "./stdin-runner.js";

runHookEntry("expansion handler", parseExpansionInput, handleExpansion);
