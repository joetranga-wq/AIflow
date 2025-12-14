import { describe, it, expect } from "vitest";
import { classifyLLMErrorV2, shouldRetryFromPolicyV2 } from "../runAiflow.mts";

describe("retry policy v2 (errorCode + errorClass)", () => {
  it("classifies 429 as transient + rate_limit", () => {
    const err = { message: "Resource exhausted", status: 429 };
    expect(classifyLLMErrorV2(err)).toEqual({ errorClass: "transient", errorCode: "rate_limit" });
  });

  it("classifies timeout as transient + timeout", () => {
    const err = { message: "Request timeout after 30s" };
    expect(classifyLLMErrorV2(err)).toEqual({ errorClass: "transient", errorCode: "timeout" });
  });

  it("classifies network-ish failures as transient + network", () => {
    const err = { message: "fetch failed", code: "ECONNRESET" };
    expect(classifyLLMErrorV2(err)).toEqual({ errorClass: "transient", errorCode: "network" });
  });

  it("retries on exact errorCode match", () => {
    const decision = shouldRetryFromPolicyV2({
      errorClass: "transient",
      errorCode: "timeout",
      attempt: 1,
      maxAttempts: 2,
      retryOn: ["timeout"], // exact match
    });

    expect(decision.shouldRetry).toBe(true);
    expect(decision.retryReason).toBe("policy_match:timeout");
  });

  it("retries on transient fallback when retryOn includes transient", () => {
    const decision = shouldRetryFromPolicyV2({
      errorClass: "transient",
      errorCode: "rate_limit",
      attempt: 1,
      maxAttempts: 3,
      retryOn: ["transient"], // fallback
    });

    expect(decision.shouldRetry).toBe(true);
    expect(decision.retryReason).toBe("policy_match:transient");
  });

  it("does NOT retry when no match", () => {
    const decision = shouldRetryFromPolicyV2({
      errorClass: "transient",
      errorCode: "network",
      attempt: 1,
      maxAttempts: 3,
      retryOn: ["timeout"], // no match
    });

    expect(decision.shouldRetry).toBe(false);
    expect(decision.retryReason).toBe("policy_no_match:network");
  });

  it("never retries hard errors (even if policy includes hard)", () => {
    const decision = shouldRetryFromPolicyV2({
      errorClass: "hard",
      errorCode: undefined,
      attempt: 1,
      maxAttempts: 3,
      retryOn: ["hard", "transient", "timeout"],
    });

    expect(decision.shouldRetry).toBe(false);
    expect(decision.retryReason).toBe("hard_error");
  });

  it("stops at max attempts", () => {
    const decision = shouldRetryFromPolicyV2({
      errorClass: "transient",
      errorCode: "timeout",
      attempt: 2,
      maxAttempts: 2,
      retryOn: ["timeout", "transient"],
    });

    expect(decision.shouldRetry).toBe(false);
    expect(decision.retryReason).toBe("max_attempts_reached");
  });
});
