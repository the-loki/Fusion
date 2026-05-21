import { afterEach, describe, expect, it } from "vitest";
import { DependencyCycleError } from "@fusion/core";
import { hasGit, makeReliabilityFixture } from "./_helpers.js";

const describeIfGit = hasGit ? describe : describe.skip;

describeIfGit("reliability interactions: dependency-cycle reconciliation", () => {
  const fixtures: Array<Awaited<ReturnType<typeof makeReliabilityFixture>>> = [];

  afterEach(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
  });

  it("auto-repairs umbrella back-edge cycles and records audit/log evidence", async () => {
    const fx = await makeReliabilityFixture({ taskId: "FN-5256-U" });
    fixtures.push(fx);

    const umbrella = await fx.store.createTask({
      id: "FN-5256-P",
      title: "Umbrella: track FN-5256",
      description: "parent",
    } as any);
    const child = await fx.store.createTask({ id: "FN-5256-C", title: "Foundation child", description: "child" } as any);

    fx.store.getDatabase().prepare("UPDATE tasks SET dependencies = ? WHERE id = ?").run(JSON.stringify([child.id]), umbrella.id);
    fx.store.getDatabase().prepare("UPDATE tasks SET dependencies = ? WHERE id = ?").run(JSON.stringify([umbrella.id]), child.id);

    const recovered = await fx.manager.reconcileDependencyCycles();
    expect(recovered).toBe(1);

    const updatedChild = await fx.store.getTask(child.id);
    const updatedUmbrella = await fx.store.getTask(umbrella.id);
    expect(updatedChild?.dependencies).toEqual([]);
    expect(updatedUmbrella?.dependencies).toEqual([child.id]);
    expect(updatedChild?.log.some((entry) => JSON.stringify(entry).includes("Auto-cleared umbrella back-edge"))).toBe(true);

    const repairedAudit = fx.store.getRunAuditEvents({
      taskId: child.id,
      domain: "database",
      mutationType: "task:auto-reconciled-dependency-cycle",
    });
    expect(repairedAudit).toHaveLength(1);
    expect(repairedAudit[0]?.metadata).toMatchObject({
      removedDependency: umbrella.id,
      reason: "umbrella-back-edge",
    });
  });

  it("detects ambiguous FN-5240/FN-5241/FN-5242 persisted cycle once and leaves it unchanged", async () => {
    const fx = await makeReliabilityFixture({ taskId: "FN-5256-A" });
    fixtures.push(fx);

    const a = await fx.store.createTask({ id: "FN-5240", title: "Task A", description: "A" } as any);
    const b = await fx.store.createTask({ id: "FN-5241", title: "Task B", description: "B" } as any);
    const c = await fx.store.createTask({ id: "FN-5242", title: "Task C", description: "C" } as any);

    fx.store.getDatabase().prepare("UPDATE tasks SET dependencies = ? WHERE id = ?").run(JSON.stringify([b.id]), a.id);
    fx.store.getDatabase().prepare("UPDATE tasks SET dependencies = ? WHERE id = ?").run(JSON.stringify([c.id]), b.id);
    fx.store.getDatabase().prepare("UPDATE tasks SET dependencies = ? WHERE id = ?").run(JSON.stringify([a.id]), c.id);

    const recovered = await fx.manager.reconcileDependencyCycles();
    expect(recovered).toBe(0);

    expect((await fx.store.getTask(a.id))?.dependencies).toEqual([b.id]);
    expect((await fx.store.getTask(b.id))?.dependencies).toEqual([c.id]);
    expect((await fx.store.getTask(c.id))?.dependencies).toEqual([a.id]);

    const detected = fx.store.getRunAuditEvents({
      taskId: a.id,
      domain: "database",
      mutationType: "task:dependency-cycle-detected",
    });
    const unrepaired = fx.store.getRunAuditEvents({
      taskId: a.id,
      domain: "database",
      mutationType: "task:dependency-cycle-unrepaired",
    });
    expect(detected).toHaveLength(1);
    expect(unrepaired).toHaveLength(1);
  });

  it("composes self-defeating cleanup before dependency-cycle cleanup and keeps write-time guard active", async () => {
    const fx = await makeReliabilityFixture({ taskId: "FN-5256-COMP" });
    fixtures.push(fx);

    const child = await fx.store.createTask({ id: "FN-5256-CHILD", title: "child", description: "child" } as any);
    const umbrella = await fx.store.createTask({
      id: "FN-5256-UMB",
      title: "Umbrella coordination",
      description: "umbrella",
      dependencies: [child.id],
    } as any);

    fx.store.getDatabase().prepare("UPDATE tasks SET title = ?, dependencies = ? WHERE id = ?").run(
      `Finalize ${child.id}: close loop`,
      JSON.stringify([child.id]),
      child.id,
    );

    const selfDefRecovered = await fx.manager.reconcileSelfDefeatingDependencies();
    expect(selfDefRecovered).toBe(1);
    expect((await fx.store.getTask(child.id))?.dependencies).toEqual([]);

    fx.store.getDatabase().prepare("UPDATE tasks SET dependencies = ? WHERE id = ?").run(JSON.stringify([umbrella.id]), child.id);

    const cycleRecovered = await fx.manager.reconcileDependencyCycles();
    expect(cycleRecovered).toBe(1);

    const updatedChild = await fx.store.getTask(child.id);
    expect(updatedChild?.dependencies).toEqual([]);

    const selfDefAudit = fx.store.getRunAuditEvents({
      taskId: child.id,
      domain: "database",
      mutationType: "task:auto-reconciled-self-defeating-dep",
    });
    const cycleAudit = fx.store.getRunAuditEvents({
      taskId: child.id,
      domain: "database",
      mutationType: "task:auto-reconciled-dependency-cycle",
    });
    expect(selfDefAudit).toHaveLength(1);
    expect(cycleAudit).toHaveLength(1);

    await expect(fx.store.updateTask(child.id, { dependencies: [umbrella.id] })).rejects.toBeInstanceOf(DependencyCycleError);
  });
});
