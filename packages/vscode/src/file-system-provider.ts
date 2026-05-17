import { mkdir, rename as fsRename, rm, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import {
  checkVaultMode,
  readVirtualFile,
  validatePath,
  validatePathForWrite,
  VAULT_MODE,
} from "@obsidian-vfs/core";
import type {
  FileChangeEvent,
  FileChangeType,
  LocalIndexTracker,
  PathSecurityOptions,
  VaultMode,
  VFSFileType,
} from "@obsidian-vfs/core";

import { throwFileExists, throwVFSError } from "./error-mapper.js";
import { SCHEME, toVaultPath, toVscodeUri } from "./uri-adapter.js";

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
  #autoMount: ReadonlySet<string>;
  #vaultMode: VaultMode;
  #autoMountPaths: readonly string[];

  readonly #onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.#onDidChangeFile.event;

  constructor(
    tracker: LocalIndexTracker,
    autoMount: readonly string[] = [],
    vaultMode: VaultMode = VAULT_MODE.RW,
  ) {
    this.#tracker = tracker;
    this.#securityOptions = {
      vaultRoot: tracker.context.physicalPath,
      allowed: tracker.context.vfsConfig.allowed,
      blocked: tracker.context.vfsConfig.blocked,
    };
    this.#autoMount = new Set(autoMount.map((e) => e.split("/")[0]));
    this.#autoMountPaths = autoMount;
    this.#vaultMode = vaultMode;
  }

  setAutoMount(entries: readonly string[]): void {
    this.#autoMountPaths = entries;
    const updated = new Set(entries.map((e) => e.split("/")[0]));
    const vaultName = this.#tracker.context.name;
    const previous = this.#autoMount;
    this.#autoMount = updated;

    const events: vscode.FileChangeEvent[] = [];
    for (const entry of updated) {
      if (!previous.has(entry)) {
        events.push({ type: vscode.FileChangeType.Created, uri: toVscodeUri(entry, vaultName) });
      }
    }
    for (const entry of previous) {
      if (!updated.has(entry)) {
        events.push({ type: vscode.FileChangeType.Deleted, uri: toVscodeUri(entry, vaultName) });
      }
    }
    if (events.length > 0) {
      this.#onDidChangeFile.fire(events);
    }
  }

  setVaultMode(mode: VaultMode): void {
    this.#vaultMode = mode;
  }

  #guardWrite(vaultPath: string, uri: vscode.Uri): void {
    const result = checkVaultMode(vaultPath, this.#vaultMode, this.#autoMountPaths);
    if (!result.ok) throwVFSError(result, uri);
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
    const entries: [string, vscode.FileType][] = result.value.map(([name, type]) => [
      name,
      mapFileType(type),
    ]);
    if (vaultPath === "" && this.#autoMount.size > 0) {
      return entries.filter(([name]) => this.#autoMount.has(name));
    }
    return entries;
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { readonly create: boolean; readonly overwrite: boolean },
  ): Promise<void> {
    const vaultPath = toVaultPath(uri);
    this.#guardWrite(vaultPath, uri);
    const pathResult = await validatePathForWrite(vaultPath, this.#securityOptions);
    if (!pathResult.ok) throwVFSError(pathResult, uri);

    const statResult = await this.#tracker.stat(vaultPath);
    const exists = statResult.ok;

    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (exists && !options.overwrite) {
      throwFileExists(uri);
    }
    await mkdir(path.dirname(pathResult.value), { recursive: true });
    await fsWriteFile(pathResult.value, content);
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const vaultPath = toVaultPath(uri);
    this.#guardWrite(vaultPath, uri);
    const pathResult = await validatePathForWrite(vaultPath, this.#securityOptions);
    if (!pathResult.ok) throwVFSError(pathResult, uri);
    await mkdir(pathResult.value, { recursive: true });
  }

  async copy(
    source: vscode.Uri,
    destination: vscode.Uri,
    options: { readonly overwrite: boolean },
  ): Promise<void> {
    const content = await vscode.workspace.fs.readFile(source);
    await this.writeFile(destination, content, { create: true, overwrite: options.overwrite });
    this.#onDidChangeFile.fire([{ type: vscode.FileChangeType.Created, uri: destination }]);
  }

  async delete(uri: vscode.Uri, options: { readonly recursive: boolean }): Promise<void> {
    const vaultPath = toVaultPath(uri);
    this.#guardWrite(vaultPath, uri);
    const pathResult = await validatePath(vaultPath, this.#securityOptions);
    if (!pathResult.ok) throwVFSError(pathResult, uri);
    await rm(pathResult.value, { recursive: options.recursive });
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { readonly overwrite: boolean },
  ): Promise<void> {
    if (oldUri.scheme === SCHEME && newUri.scheme === SCHEME) {
      const oldVaultPath = toVaultPath(oldUri);
      this.#guardWrite(oldVaultPath, oldUri);
      const oldPathResult = await validatePath(oldVaultPath, this.#securityOptions);
      if (!oldPathResult.ok) throwVFSError(oldPathResult, oldUri);

      const newVaultPath = toVaultPath(newUri);
      this.#guardWrite(newVaultPath, newUri);
      const newPathResult = await validatePathForWrite(newVaultPath, this.#securityOptions);
      if (!newPathResult.ok) throwVFSError(newPathResult, newUri);

      if (!options.overwrite) {
        const statResult = await this.#tracker.stat(newVaultPath);
        if (statResult.ok) throwFileExists(newUri);
      }

      await mkdir(path.dirname(newPathResult.value), { recursive: true });
      await fsRename(oldPathResult.value, newPathResult.value);
      return;
    }

    await vscode.workspace.fs.copy(oldUri, newUri, { overwrite: options.overwrite });
    if (oldUri.scheme === SCHEME) {
      await this.delete(oldUri, { recursive: false });
    }
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
