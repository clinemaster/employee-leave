import { mizigoItemSchema, taxiExpenseSchema, travelRouteSchema } from "./leaveApplication";

// Travel Payment Request ("JEDWALI 1") schema validation — idadi/quantity/
// number_of_trips must be non-negative integers, fare/cost values positive,
// from/to required non-empty strings whenever a route exists.

describe("travelRouteSchema", () => {
  it("accepts a valid route with a zero-idadi passenger row", () => {
    const result = travelRouteSchema.safeParse({
      from_place: "Arusha",
      to_place: "Dodoma",
      fare_per_person: 85000,
      trip_type: "ROUND_TRIP",
      passengers: [{ person_type: 1, idadi: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing from_place", () => {
    const result = travelRouteSchema.safeParse({
      from_place: "",
      to_place: "Dodoma",
      fare_per_person: 85000,
      trip_type: "ONE_WAY",
      passengers: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing to_place", () => {
    const result = travelRouteSchema.safeParse({
      from_place: "Arusha",
      to_place: "",
      fare_per_person: 85000,
      trip_type: "ONE_WAY",
      passengers: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive fare", () => {
    const result = travelRouteSchema.safeParse({
      from_place: "Arusha",
      to_place: "Dodoma",
      fare_per_person: 0,
      trip_type: "ONE_WAY",
      passengers: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative idadi", () => {
    const result = travelRouteSchema.safeParse({
      from_place: "Arusha",
      to_place: "Dodoma",
      fare_per_person: 85000,
      trip_type: "ONE_WAY",
      passengers: [{ person_type: 1, idadi: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric idadi", () => {
    const result = travelRouteSchema.safeParse({
      from_place: "Arusha",
      to_place: "Dodoma",
      fare_per_person: 85000,
      trip_type: "ONE_WAY",
      passengers: [{ person_type: 1, idadi: "four" as unknown as number }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a fractional idadi", () => {
    const result = travelRouteSchema.safeParse({
      from_place: "Arusha",
      to_place: "Dodoma",
      fare_per_person: 85000,
      trip_type: "ONE_WAY",
      passengers: [{ person_type: 1, idadi: 1.5 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("taxiExpenseSchema", () => {
  it("accepts a valid taxi expense", () => {
    const result = taxiExpenseSchema.safeParse({ number_of_trips: 2, cost_per_trip: 100000 });
    expect(result.success).toBe(true);
  });

  it("rejects a negative number_of_trips", () => {
    const result = taxiExpenseSchema.safeParse({ number_of_trips: -1, cost_per_trip: 100000 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive cost_per_trip", () => {
    const result = taxiExpenseSchema.safeParse({ number_of_trips: 2, cost_per_trip: 0 });
    expect(result.success).toBe(false);
  });
});

describe("mizigoItemSchema", () => {
  it("accepts a valid luggage item", () => {
    const result = mizigoItemSchema.safeParse({ description: "Suitcase", quantity: 1, unit_cost: 20000 });
    expect(result.success).toBe(true);
  });

  it("rejects a missing description", () => {
    const result = mizigoItemSchema.safeParse({ description: "", quantity: 1, unit_cost: 20000 });
    expect(result.success).toBe(false);
  });

  it("rejects a negative quantity", () => {
    const result = mizigoItemSchema.safeParse({ description: "Suitcase", quantity: -1, unit_cost: 20000 });
    expect(result.success).toBe(false);
  });
});
