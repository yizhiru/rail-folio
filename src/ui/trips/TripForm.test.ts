import { expect, it } from "vitest";
import { EMPTY_TRIP_FORM, validateTripForm, formValuesToTripInput } from "./TripForm";

const values = { ...EMPTY_TRIP_FORM, date: "2024-01-01", trainNo: "Z1", fromName: "甲", toName: "乙", departureTime: "09:00", arrivalTime: "12:00", arrivalDayOffset: "2" };
it("validates real dates, clock ranges and whole nonnegative day offsets", () => {
  expect(validateTripForm(values)).toBeNull();
  expect(validateTripForm({ ...values, date: "2024-02-30" })).toBe("日期无效");
  expect(validateTripForm({ ...values, departureTime: "29:00" })).toContain("HH:mm");
  expect(validateTripForm({ ...values, arrivalDayOffset: "1.5" })).toContain("整数");
  expect(validateTripForm({ ...values, arrivalDayOffset: "0", arrivalTime: "08:00" })).toContain("不能早于");
});
it("includes the explicit arrival day in saved form input", () => {
  expect(formValuesToTripInput(values, (name) => ({ id: name, name }), { source: "manual" })).toMatchObject({ arrivalDayOffset: 2 });
});
