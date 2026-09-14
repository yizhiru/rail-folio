import { describe, expect, it } from "vitest";
import { categoryFromTrainNo } from "./fingerprint";

describe("categoryFromTrainNo", () => {
  it("keeps G D C Z and folds everything else into 普速", () => {
    expect(categoryFromTrainNo("G123")).toBe("G");
    expect(categoryFromTrainNo("d2282")).toBe("D");
    expect(categoryFromTrainNo("C2002")).toBe("C");
    expect(categoryFromTrainNo("Z8991")).toBe("Z");
    expect(categoryFromTrainNo("K1316")).toBe("P");
    expect(categoryFromTrainNo("T1")).toBe("P");
    expect(categoryFromTrainNo("L101")).toBe("P");
    expect(categoryFromTrainNo("N201")).toBe("P");
    expect(categoryFromTrainNo("1461")).toBe("P");
    expect(categoryFromTrainNo("Y1")).toBe("P");
    expect(categoryFromTrainNo("S1")).toBe("P");
  });
});
