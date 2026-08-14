import { describe, expect, it } from "vitest";
import { maskIp } from "./http";

describe("maskIp", () => {
  it("masks IPv4 addresses to a /24 prefix", () => {
    expect(maskIp("203.0.113.42")).toBe("203.0.113.0/24");
  });

  it("masks compressed IPv6 loopback without producing an invalid address", () => {
    expect(maskIp("::1")).toBe("::/48");
  });

  it("masks regular and compressed IPv6 addresses to a /48 prefix", () => {
    expect(maskIp("2001:0db8:1234:5678::1")).toBe("2001:db8:1234::/48");
    expect(maskIp("2001:db8::abcd")).toBe("2001:db8:0::/48");
  });

  it("rejects malformed addresses instead of retaining them", () => {
    expect(maskIp("not-an-ip")).toBe("");
    expect(maskIp("2001:::1")).toBe("");
  });
});
