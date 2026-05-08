import { mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { readVirtualFile, validatePath } from "@obsidian-vfs/core";
import type {
  FileChangeEvent,
  FileChangeType,
  LocalIndexTracker,
  PathSecurityOptions,
  VFSFileType,
} from "@obsidian-vfs/core";

import { throwFileExists, throwVFSError } from "./error-mapper.js";
import { toVaultPath, toVscodeUri } from "./uri-adapter.js";

/** Map core `VFSFileType` to `vscode.FileType`. */
function mapFileType(type: VFSFileType): vscode.FileType {
  return type === "directory" ? vscode.FileType.Directory : vscode.FileType.File;
}

/** Map core `FileChangeType` to `vscode.FileChangeType`. */
function mapChangeType(type: FileChangeType): vscode.FileChangeType {
  switch (type) {
    case "changed":
      return vscode.FileChangeType.Changed;
    case "created":
      return vscode.FileChangeType.Created;
    case "deleted":
      return vscode.FileChangeType.Deleted;
  }
}

/** `FileSystemProvider` backed by `LocalIndexTracker` for read operations. */
export class ObsidianFileSystemProvider implements vscode.FileSystemProvider {
  readonly #tracker: LocalIndexTracker;
  readonly #securityOptions: PathSecurityOptions;

  readonly #onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.#onDidChangeFile.event;

  constructor(tracker: LocalIndexTracker) {
    this.#tracker = tracker;
    this.#securityOptions = {
      vaultRoot: tracker.context.physicalPath,
      allowedFolders: tracker.context.vfsConfig.allowedFolders,
    };
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const vaultPath = toVaultPath(uri);
    const result = await this.#tracker.stat(vaultPath);
    if (!result.ok) throwVFSError(result, uri);
    return {
      type: mapFileType(result.value.type),
      mtime: result.value.mtime,
      ctime: result.value.ctime,
      size: result.value.size,
    };
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const vaultPath = toVaultPath(uri);
    const result = await readVirtualFile(vaultPath, this.#securityOptions);
    if (!result.ok) throwVFSError(result, uri);
    return result.value;
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const vaultPath = toVaultPath(uri);
    const result = await this.#tracker.readDirectory(vaultPath);
    if (!result.ok) throwVFSError(result, uri);
    return result.value.map(([name, type]) => [name, mapFileType(type)]);
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { readonly create: boolean; readonly overwrite: boolean },
  ): Promise<void> {
    const vaultPath = toVaultPath(uri);
    const pathResult = await validatePath(vaultPath, this.#securityOptions);
    if (!pathResult.ok) throwVFSError(pathResult, uri);

    const statResult = await this.#tracker.stat(vaultPath);
    const exists = statResult.ok;

    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (exists && !options.overwrite) {
      throwFileExists(uri);
    }
    await fsWriteFile(pathResult.value, content);
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const vaultPath = toVaultPath(uri);
    const pathResult = await validatePath(vaultPath, this.#securityOptions);
    if (!pathResult.ok) throwVFSError(pathResult, uri);
    await mkdir(pathResult.value, { recursive: true });
  }

  /** Required interface method. Workspace folders use `file://` URIs so the native FS handles these. */
  delete(): Promise<void> {
    throw vscode.FileSystemError.NoPermissions("Not supported on obs:// scheme");
  }

  /** Required interface method. Workspace folders use `file://` URIs so the native FS handles these. */
  rename(): Promise<void> {
    throw vscode.FileSystemError.NoPermissions("Not supported on obs:// scheme");
  }

  /** Subscribe to file change events, filtering by watched prefix. */
  watch(uri: vscode.Uri): vscode.Disposable {
    const prefix = toVaultPath(uri);
    const vaultName = this.#tracker.context.name;

    const disposable = this.#tracker.onDidChangeFile((events: readonly FileChangeEvent[]) => {
      const mapped = events
        .filter((e) => this.#isUnderPrefix(e.path, prefix))
        .map((e) => ({
          type: mapChangeType(e.type),
          uri: toVscodeUri(this.#toVaultRelative(e.path), vaultName),
        }));

      if (mapped.length > 0) {
        this.#onDidChangeFile.fire(mapped);
      }
    });

    return disposable;
  }

  /** Check if an absolute path is under the watched prefix. */
  #isUnderPrefix(absolutePath: string, prefix: string): boolean {
    const vaultRelative = this.#toVaultRelative(absolutePath);
    return prefix === "" || vaultRelative === prefix || vaultRelative.startsWith(prefix + "/");
  }

  /** Convert absolute path to vault-relative path. */
  #toVaultRelative(absolutePath: string): string {
    return path.relative(this.#tracker.context.physicalPath, absolutePath);
  }

  /** Clean up emitter resources. */
  dispose(): void {
    this.#onDidChangeFile.dispose();
  }
}
