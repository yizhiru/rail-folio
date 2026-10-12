import { describe, expect, it } from "vitest";
import { formatDateCn } from "./dateLabel";

describe("formatDateCn", () => {
  it("writes year, month and day without zero padding", () => {
    expect(formatDateCn("2025-02-03")).toBe("2025年2月3日");
    expect(formatDateCn("2024-12-31")).toBe("2024年12月31日");
  });

  it("returns anything else unchanged", () => {
    expect(formatDateCn("")).toBe("");
    expect(formatDateCn("2025/02/03")).toBe("2025/02/03");
  });
});
