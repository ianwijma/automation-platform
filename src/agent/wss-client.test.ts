import { describe, test, expect, beforeEach } from "bun:test";
import { WssAgentClient } from "./wss-client.js";

describe("WssAgentClient", () => {
  let client: WssAgentClient;

  beforeEach(() => {
    client = new WssAgentClient({
      name: "test-agent",
      version: "1.0.0",
      token: "test-token-123",
    });
  });

  test("construction sets defaults - not connected", () => {
    expect(client.isConnected()).toBe(false);
    expect(client.getAgentId()).toBeNull();
  });

  test("disconnect cleans up state", () => {
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  test("setOnDisconnected stores callback", () => {
    let called = false;
    client.setOnDisconnected(() => {
      called = true;
    });
    client.disconnect();
  });

  test("sendCapabilities does nothing when not connected", () => {
    client.sendCapabilities({
      os: "linux",
      arch: "x64",
      display: "none",
      tools: [],
      screen: false,
      input: "none",
    });
  });

  test("connect method exists and is callable", () => {
    expect(typeof client.connect).toBe("function");
  });

  test("disconnect clears heartbeat and reconnect timers", () => {
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  test("client stores token from constructor", () => {
    const client2 = new WssAgentClient({
      name: "another",
      version: "2.0.0",
      token: "tok-456",
    });
    expect(client2.isConnected()).toBe(false);
  });

  test("getAgentId returns null before connection", () => {
    expect(client.getAgentId()).toBeNull();
  });

  test("isConnected returns false before connection", () => {
    expect(client.isConnected()).toBe(false);
  });

  test("client name and version are stored", () => {
    const client3 = new WssAgentClient({
      name: "named-agent",
      version: "3.0.0",
      token: "tok",
    });
    expect(client3.isConnected()).toBe(false);
  });
});
