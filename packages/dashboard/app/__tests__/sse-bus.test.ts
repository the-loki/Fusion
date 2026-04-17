import { describe, it, expect, afterEach } from "vitest";
import { MockEventSource } from "../../vitest.setup";
import { subscribeSse, __resetSseBus, __sseBusChannelCount } from "../sse-bus";

afterEach(() => {
  __resetSseBus();
});

describe("sse-bus", () => {
  it("opens one EventSource per URL regardless of subscriber count", () => {
    const url = "/api/events?projectId=p1";
    const unsubA = subscribeSse(url, { events: { "task:created": () => {} } });
    const unsubB = subscribeSse(url, { events: { "task:updated": () => {} } });
    const unsubC = subscribeSse(url, { events: { "task:deleted": () => {} } });

    const sources = MockEventSource.instances.filter((es) => es.url === url);
    expect(sources).toHaveLength(1);

    unsubA();
    unsubB();
    unsubC();
  });

  it("opens separate EventSources for different URLs", () => {
    const unsubA = subscribeSse("/api/events", {});
    const unsubB = subscribeSse("/api/events?projectId=p1", {});
    expect(MockEventSource.instances).toHaveLength(2);
    unsubA();
    unsubB();
  });

  it("dispatches events to every subscriber of the same URL", () => {
    const url = "/api/events";
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const unsubA = subscribeSse(url, {
      events: { "task:created": (e) => receivedA.push(JSON.parse(e.data)) },
    });
    const unsubB = subscribeSse(url, {
      events: { "task:created": (e) => receivedB.push(JSON.parse(e.data)) },
    });

    const es = MockEventSource.instances[0];
    es._emit("task:created", { id: "t-1" });

    expect(receivedA).toEqual([{ id: "t-1" }]);
    expect(receivedB).toEqual([{ id: "t-1" }]);

    unsubA();
    unsubB();
  });

  it("closes the EventSource when the last subscriber unsubscribes", () => {
    const url = "/api/events";
    const unsubA = subscribeSse(url, {});
    const unsubB = subscribeSse(url, {});
    expect(__sseBusChannelCount()).toBe(1);

    const es = MockEventSource.instances[0];
    unsubA();
    expect(es.close).not.toHaveBeenCalled();

    unsubB();
    expect(es.close).toHaveBeenCalledTimes(1);
    expect(__sseBusChannelCount()).toBe(0);
  });

  it("stops dispatching to a subscriber after it unsubscribes", () => {
    const url = "/api/events";
    const received: unknown[] = [];
    const unsub = subscribeSse(url, {
      events: { "task:created": (e) => received.push(JSON.parse(e.data)) },
    });

    const es = MockEventSource.instances[0];
    es._emit("task:created", { id: "t-1" });
    expect(received).toEqual([{ id: "t-1" }]);

    unsub();
    // Another subscriber keeps the channel alive so we can assert the old handler is gone.
    const unsub2 = subscribeSse(url, {});
    es._emit("task:created", { id: "t-2" });
    expect(received).toEqual([{ id: "t-1" }]);
    unsub2();
  });

  it("attaches native listeners lazily as new event types are subscribed", () => {
    const url = "/api/events";
    const unsubA = subscribeSse(url, { events: { "task:created": () => {} } });
    const es = MockEventSource.instances[0];
    expect(Object.keys(es.listeners)).toEqual(
      expect.arrayContaining(["task:created"])
    );
    expect(es.listeners["task:updated"]).toBeUndefined();

    const unsubB = subscribeSse(url, { events: { "task:updated": () => {} } });
    expect(es.listeners["task:updated"]).toBeDefined();

    unsubA();
    unsubB();
  });

  it("fires onOpen for every subscriber on initial connect", () => {
    const url = "/api/events";
    let opensA = 0;
    let opensB = 0;
    const unsubA = subscribeSse(url, { onOpen: () => opensA++ });
    const unsubB = subscribeSse(url, { onOpen: () => opensB++ });

    const es = MockEventSource.instances[0];
    es._emit("open");

    expect(opensA).toBe(1);
    expect(opensB).toBe(1);

    unsubA();
    unsubB();
  });

  it("fires onReconnect whenever the channel is rebuilt", () => {
    const url = "/api/events";
    let reconnects = 0;
    const unsub = subscribeSse(url, {
      onReconnect: () => reconnects++,
    });
    const es = MockEventSource.instances[0];
    // An error that tears down the connection triggers a resync signal.
    es._emit("error");
    expect(reconnects).toBe(1);
    unsub();
  });
});
