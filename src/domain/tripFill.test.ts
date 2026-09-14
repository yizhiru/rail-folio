import { describe, expect, it } from "vitest";
import type { Trip, TripDraft } from "./types";
import { annotateDuplicateDraft, fillMissingTripFields, tripNeedsFill } from "./tripFill";

const existing: Trip = {
  id: "old",
  date: "2024-05-01",
  trainNo: "G123",
  category: "G",
  fromStationId: "AOH",
  toStationId: "NJH",
  source: "manual",
  fingerprint: "2024-05-01|G123|AOH|NJH",
};

describe("fillMissingTripFields", () => {
  it("fills blank optional fields and leaves existing values alone", () => {
    const filled = fillMissingTripFields(
      { ...existing, seatClass: "二等座" },
      { seatClass: "商务座", ticketPrice: 144.5, departureTime: "09:00" },
    );
    expect(filled).toMatchObject({
      id: "old",
      seatClass: "二等座",
      ticketPrice: 144.5,
      departureTime: "09:00",
    });
  });

  it("returns undefined when there is nothing new to write", () => {
    expect(
      fillMissingTripFields(
        { ...existing, ticketPrice: 144.5, seatClass: "二等座" },
        { ticketPrice: 200, seatClass: "商务座" },
      ),
    ).toBeUndefined();
    expect(tripNeedsFill(existing, {})).toBe(false);
  });
});

describe("annotateDuplicateDraft", () => {
  const draft = (parsed: TripDraft["parsed"], extra: Partial<TripDraft> = {}): TripDraft => ({
    id: "draft",
    rawText: "",
    confidence: 1,
    parsed: {
      date: "2024-05-01",
      trainNo: "G123",
      fromStationId: "AOH",
      toStationId: "NJH",
      ...parsed,
    },
    needsReview: false,
    selected: true,
    ...extra,
  });

  it("selects a fingerprint match that can fill blanks", () => {
    const next = annotateDuplicateDraft(draft({ ticketPrice: 144.5 }), [existing]);
    expect(next.duplicateOf).toBe("old");
    expect(next.selected).toBe(true);
    expect(next.needsReview).toBe(false);
  });

  it("unselects a fingerprint match with nothing new", () => {
    const next = annotateDuplicateDraft(
      draft({ ticketPrice: 200 }),
      [{ ...existing, ticketPrice: 144.5 }],
    );
    expect(next.duplicateOf).toBe("old");
    expect(next.selected).toBe(false);
    expect(next.needsReview).toBe(true);
  });
});
