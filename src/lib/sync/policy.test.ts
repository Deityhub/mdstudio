import { describe, expect, it } from "vitest";
import { createPullPolicy } from "./policy";

describe("when a sync round pulls", () => {
  it("pulls the first time, and every time while there is no live connection", () => {
    const p = createPullPolicy();
    expect(p.nextRoundPulls()).toBe(true);
    expect(p.nextRoundPulls()).toBe(true); // the poll, or a nudge, with nothing live
  });

  it("pulls once to catch up when the connection comes, then not at all while it is up", () => {
    const p = createPullPolicy();
    p.nextRoundPulls();
    p.setConnected(true);
    expect(p.nextRoundPulls()).toBe(true); // what happened before it was ready
    for (let i = 0; i < 5; i++) expect(p.nextRoundPulls()).toBe(false); // saves, pushes
  });

  it("pulls again once the connection drops, and once more when it comes back", () => {
    const p = createPullPolicy();
    p.setConnected(true);
    p.nextRoundPulls();
    p.setConnected(false);
    expect(p.nextRoundPulls()).toBe(true);
    expect(p.nextRoundPulls()).toBe(true);
    p.setConnected(true);
    expect(p.nextRoundPulls()).toBe(true);
    expect(p.nextRoundPulls()).toBe(false);
  });

  it("pulls when something said so: a hint for a draft too big to send, or one that had to wait", () => {
    const p = createPullPolicy();
    p.setConnected(true);
    p.nextRoundPulls();
    expect(p.nextRoundPulls()).toBe(false);
    p.owePull();
    expect(p.nextRoundPulls()).toBe(true);
    expect(p.nextRoundPulls()).toBe(false); // paid once
  });

  it("nudges (focus, coming back to the tab) only matter without a live connection; coming online always does", () => {
    const p = createPullPolicy();
    expect(p.nudgeWorthIt("focus")).toBe(true);
    p.setConnected(true);
    expect(p.nudgeWorthIt("focus")).toBe(false);
    expect(p.nudgeWorthIt("online")).toBe(true); // the network came back: the socket may have died unseen
  });
});
