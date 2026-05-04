import type { ListResourcesArgs } from "./types.js";
import { run as runListResources } from "./cmd-list-resources.js";

/** Execute the list-agents command. */
export async function run(args: ListResourcesArgs): Promise<number> {
  return runListResources(args, "agents", (tracker) => tracker.listAgents());
}
