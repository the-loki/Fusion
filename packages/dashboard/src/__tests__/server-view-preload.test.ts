// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect } from "vitest";
import { TaskStore } from "@fusion/core";
import { createServer } from "../server.js";
import { createLoopbackIntegrationTest } from "./loopback-integration-test.js";

const serverViewPreloadIntegrationTest = await createLoopbackIntegrationTest("server-view-preload integration");

let tempRoots: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

async function startServerWithFixture(clientDir: string) {
  const rootDir = makeTempDir("fn-4782-root-");
  const globalDir = makeTempDir("fn-4782-global-");
  const store = new TaskStore(rootDir, globalDir);
  await store.init();

  const previousClientDir = process.env.FUSION_CLIENT_DIR;
  process.env.FUSION_CLIENT_DIR = clientDir;

  const app = createServer(store);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  return {
    server,
    restoreEnv: () => {
      process.env.FUSION_CLIENT_DIR = previousClientDir;
    },
  };
}

afterEach(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe("server index preload injection", () => {
  serverViewPreloadIntegrationTest("injects view chunk map and modulepreload bootstrap", async () => {
    const clientDir = makeTempDir("fn-4782-client-");
    mkdirSync(join(clientDir, ".vite"), { recursive: true });
    writeFileSync(join(clientDir, "index.html"), "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>");
    writeFileSync(
      join(clientDir, ".vite", "manifest.json"),
      JSON.stringify({ "components/AgentsView.tsx": { file: "assets/AgentsView-abc123.js" } }),
    );

    const { server, restoreEnv } = await startServerWithFixture(clientDir);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing server address");

      const res = await fetch(`http://127.0.0.1:${address.port}/`);
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain("window.__FUSION_VIEW_CHUNKS__");
      expect(html).toContain('"agents":"/assets/AgentsView-abc123.js"');
      expect(html).toContain("modulepreload");
    } finally {
      restoreEnv();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  serverViewPreloadIntegrationTest("injects at marker comment when present", async () => {
    const clientDir = makeTempDir("fn-4782-client-marker-");
    mkdirSync(join(clientDir, ".vite"), { recursive: true });
    writeFileSync(
      join(clientDir, "index.html"),
      "<!doctype html><html><head><!-- fusion:view-preload --></head><body><div id=\"root\"></div></body></html>",
    );
    writeFileSync(
      join(clientDir, ".vite", "manifest.json"),
      JSON.stringify({ "components/AgentsView.tsx": { file: "assets/AgentsView-marker.js" } }),
    );

    const { server, restoreEnv } = await startServerWithFixture(clientDir);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing server address");

      const res = await fetch(`http://127.0.0.1:${address.port}/`);
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toMatch(/<!-- fusion:view-preload -->\s*<script>window\.__FUSION_VIEW_CHUNKS__/);
    } finally {
      restoreEnv();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  serverViewPreloadIntegrationTest("serves index with empty chunk map when manifest is missing", async () => {
    const clientDir = makeTempDir("fn-4782-client-no-manifest-");
    writeFileSync(join(clientDir, "index.html"), "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>");

    const { server, restoreEnv } = await startServerWithFixture(clientDir);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing server address");

      const res = await fetch(`http://127.0.0.1:${address.port}/`);
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain("window.__FUSION_VIEW_CHUNKS__={}");
    } finally {
      restoreEnv();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  serverViewPreloadIntegrationTest("escapes script poison in inlined chunk map", async () => {
    const clientDir = makeTempDir("fn-4782-client-escape-");
    mkdirSync(join(clientDir, ".vite"), { recursive: true });
    writeFileSync(join(clientDir, "index.html"), "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>");
    writeFileSync(
      join(clientDir, ".vite", "manifest.json"),
      JSON.stringify({ "components/AgentsView.tsx": { file: "assets/AgentsView-</script>-abc.js" } }),
    );

    const { server, restoreEnv } = await startServerWithFixture(clientDir);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing server address");

      const res = await fetch(`http://127.0.0.1:${address.port}/`);
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain("<\\/script>");
      expect(html).not.toContain('assets/AgentsView-</script>-abc.js");(()=>');
    } finally {
      restoreEnv();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
