import { parseSubagentInput, handleSubagentStart } from "./subagent-handler.js";
import { runHookEntry } from "./stdin-runner.js";

runHookEntry("subagent handler", parseSubagentInput, handleSubagentStart);
