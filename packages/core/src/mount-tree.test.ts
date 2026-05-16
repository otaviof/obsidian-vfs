import { describe, expect, it } from "vitest";

import { buildMountTree } from "./mount-tree.js";

describe("buildMountTree", () => {
  it("returns empty map for empty autoMount", () => {
    const tree = buildMountTree([]);
    expect(tree.size).toBe(0);
  });

  it("builds a single top-level path as fully mounted", () => {
    const tree = buildMountTree(["30-resources"]);
    expect(tree.size).toBe(1);
    expect(tree.get("30-resources")).toBeNull();
  });

  it("builds a single nested path as partial mount", () => {
    const tree = buildMountTree(["20-areas/idea"]);
    expect(tree.size).toBe(1);
    const areas = tree.get("20-areas");
    expect(areas).toBeInstanceOf(Map);
    expect((areas as Map<string, unknown>).get("idea")).toBeNull();
  });

  it("merges multiple children under the same parent", () => {
    const tree = buildMountTree(["20-areas/idea", "20-areas/work"]);
    expect(tree.size).toBe(1);
    const areas = tree.get("20-areas") as Map<string, unknown>;
    expect(areas).toBeInstanceOf(Map);
    expect(areas.size).toBe(2);
    expect(areas.get("idea")).toBeNull();
    expect(areas.get("work")).toBeNull();
  });

  it("full mount subsumes sub-path (full first)", () => {
    const tree = buildMountTree(["20-areas", "20-areas/idea"]);
    expect(tree.size).toBe(1);
    expect(tree.get("20-areas")).toBeNull();
  });

  it("full mount subsumes sub-path (sub-path first)", () => {
    const tree = buildMountTree(["20-areas/idea", "20-areas"]);
    expect(tree.size).toBe(1);
    expect(tree.get("20-areas")).toBeNull();
  });

  it("handles deep nesting", () => {
    const tree = buildMountTree(["10-projects/active/2024"]);
    expect(tree.size).toBe(1);
    const projects = tree.get("10-projects") as Map<string, unknown>;
    expect(projects).toBeInstanceOf(Map);
    const active = projects.get("active") as Map<string, unknown>;
    expect(active).toBeInstanceOf(Map);
    expect(active.get("2024")).toBeNull();
  });

  it("handles mixed depths", () => {
    const tree = buildMountTree(["20-areas/idea", "30-resources", "10-projects/active/2024"]);
    expect(tree.size).toBe(3);
    expect(tree.get("30-resources")).toBeNull();
    expect(tree.get("20-areas")).toBeInstanceOf(Map);
    expect(tree.get("10-projects")).toBeInstanceOf(Map);
  });

  it("filters empty segments from double slashes", () => {
    const tree = buildMountTree(["20-areas//idea"]);
    expect(tree.size).toBe(1);
    const areas = tree.get("20-areas") as Map<string, unknown>;
    expect(areas).toBeInstanceOf(Map);
    expect(areas.get("idea")).toBeNull();
  });

  it("deduplicates identical paths", () => {
    const tree = buildMountTree(["20-areas/idea", "20-areas/idea"]);
    expect(tree.size).toBe(1);
    const areas = tree.get("20-areas") as Map<string, unknown>;
    expect(areas).toBeInstanceOf(Map);
    expect(areas.size).toBe(1);
    expect(areas.get("idea")).toBeNull();
  });

  it("skips paths that are only empty segments", () => {
    const tree = buildMountTree(["//", ""]);
    expect(tree.size).toBe(0);
  });

  it("handles trailing slash", () => {
    const tree = buildMountTree(["20-areas/idea/"]);
    expect(tree.size).toBe(1);
    const areas = tree.get("20-areas") as Map<string, unknown>;
    expect(areas).toBeInstanceOf(Map);
    expect(areas.get("idea")).toBeNull();
  });
});
