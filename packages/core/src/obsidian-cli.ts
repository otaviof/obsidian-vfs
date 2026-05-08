import type { BacklinkEntry, ObsidianCLI, SearchMatch } from "./cli.js";
import type { CLIExecOptions } from "./exec.js";
import { execCLI } from "./exec.js";
import {
  detectCLIError,
  parseBacklinksJSON,
  parseLineList,
  parseSearchFiles,
  parseSearchJSON,
  parseSingleValue,
} from "./parsers.js";
import { AsyncQueue } from "./queue.js";
import type { VFSResult } from "./types.js";

/**
 * Concrete implementation of the ObsidianCLI interface, serializing all CLI calls
 * through an AsyncQueue.
 */
export class ObsidianCLIImpl implements ObsidianCLI {
  readonly #options: CLIExecOptions;
  readonly #queue: AsyncQueue;

  constructor(options: CLIExecOptions) {
    this.#options = options;
    this.#queue = new AsyncQueue();
  }

  /** Retrieves the absolute path to the vault root directory. */
  async vaultPath(): Promise<VFSResult<string>> {
    return this.#queue.enqueue(async () => {
      const result = await execCLI(["vault", "info=path"], this.#options);
      if (!result.ok) return result;
      return parseSingleValue(result.value.stdout, "vault info=path");
    });
  }

  /** Retrieves the human-readable vault name. */
  async vaultName(): Promise<VFSResult<string>> {
    return this.#queue.enqueue(async () => {
      const result = await execCLI(["vault", "info=name"], this.#options);
      if (!result.ok) return result;
      return parseSingleValue(result.value.stdout, "vault info=name");
    });
  }

  /** Performs full-text search returning matching file paths. */
  async search(
    query: string,
    opts?: { path?: string; limit?: number; contextLength?: number },
  ): Promise<VFSResult<string[]>> {
    return this.#queue.enqueue(async () => {
      const args = ["search", `query=${query}`, "format=json", ...this.#buildSearchOpts(opts)];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      return parseSearchFiles(result.value.stdout, args.join(" "));
    });
  }

  /** Performs full-text search returning matches with per-line context. */
  async searchContext(
    query: string,
    opts?: { path?: string; limit?: number; contextLength?: number },
  ): Promise<VFSResult<SearchMatch[]>> {
    return this.#queue.enqueue(async () => {
      const args = ["search", `query=${query}`, "format=json", ...this.#buildSearchOpts(opts)];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      return parseSearchJSON(result.value.stdout, args.join(" "));
    });
  }

  /** Lists files, optionally scoped to a folder. */
  async files(folder?: string): Promise<VFSResult<string[]>> {
    return this.#queue.enqueue(async () => {
      const args = ["files", ...(folder ? [folder] : [])];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      return parseLineList(result.value.stdout, args.join(" "));
    });
  }

  /** Lists folders, optionally scoped to a parent folder. */
  async folders(folder?: string): Promise<VFSResult<string[]>> {
    return this.#queue.enqueue(async () => {
      const args = ["folders", ...(folder ? [folder] : [])];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      return parseLineList(result.value.stdout, args.join(" "));
    });
  }

  /** Retrieves incoming wikilink references to the given file. */
  async backlinks(file: string): Promise<VFSResult<BacklinkEntry[]>> {
    return this.#queue.enqueue(async () => {
      const args = ["backlinks", file];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      return parseBacklinksJSON(result.value.stdout, args.join(" "));
    });
  }

  /** Retrieves outgoing wikilink references from the given file. */
  async links(file: string): Promise<VFSResult<string[]>> {
    return this.#queue.enqueue(async () => {
      const args = ["links", file];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      return parseLineList(result.value.stdout, args.join(" "));
    });
  }

  /** Retrieves the path to today's daily note. */
  async dailyPath(): Promise<VFSResult<string>> {
    return this.#queue.enqueue(async () => {
      const result = await execCLI(["daily", "info=path"], this.#options);
      if (!result.ok) return result;
      return parseSingleValue(result.value.stdout, "daily info=path");
    });
  }

  /** Lists all tags in the vault, optionally sorted. */
  async tags(opts?: { sort?: "name" | "count" }): Promise<VFSResult<string[]>> {
    return this.#queue.enqueue(async () => {
      const args = ["tags", ...(opts?.sort ? [`sort=${opts.sort}`] : [])];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      return parseLineList(result.value.stdout, args.join(" "));
    });
  }

  /** Reads a frontmatter property value from a note. */
  async propertyRead(file: string, name: string): Promise<VFSResult<string>> {
    return this.#queue.enqueue(async () => {
      const args = ["property-read", file, name];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      return parseSingleValue(result.value.stdout, args.join(" "));
    });
  }

  /** Health-check probe. Bypasses queue, returns true if CLI is reachable. */
  async isAvailable(): Promise<boolean> {
    const result = await execCLI(["vault", "info=path"], this.#options);
    return result.ok;
  }

  /** Opens a note in Obsidian's UI via CLI. */
  async open(file: string, newtab?: boolean): Promise<VFSResult<void>> {
    return this.#queue.enqueue(async () => {
      const args = ["open", `path=${file}`, ...(newtab ? ["newtab"] : [])];
      const result = await execCLI(args, this.#options);
      if (!result.ok) return result;
      const err = detectCLIError<void>(result.value.stdout, args.join(" "));
      if (err) return err;
      return { ok: true, value: undefined };
    });
  }

  /** Builds CLI args for search options (path, limit, contextLength). */
  #buildSearchOpts(opts?: { path?: string; limit?: number; contextLength?: number }): string[] {
    if (!opts) return [];
    const args: string[] = [];
    if (opts.path !== undefined) args.push(`path=${opts.path}`);
    if (opts.limit !== undefined) args.push(`limit=${opts.limit}`);
    if (opts.contextLength !== undefined) args.push(`context-length=${opts.contextLength}`);
    return args;
  }
}
