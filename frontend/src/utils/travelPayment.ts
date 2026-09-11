import type { MizigoItem, TaxiExpense, TravelRoute, TripType } from "@/types";

// Client-side mirror of the Travel Payment Request ("JEDWALI 1: MCHANGANUO WA
// MAOMBI YA MALIPO") calculations — used for a live preview only. The
// backend is the authority for saved amounts; once a saved route/expense
// returns a server-computed `total`/`subtotal`, prefer that over this
// recomputation (see callers).

export function tripsForType(tripType: TripType): 1 | 2 {
  return tripType === "ROUND_TRIP" ? 2 : 1;
}

export function passengerTotal(farePerPerson: number, idadi: number, tripType: TripType): number {
  return (farePerPerson || 0) * (idadi || 0) * tripsForType(tripType);
}

export function routeSubtotal(route: Pick<TravelRoute, "fare_per_person" | "trip_type" | "passengers">): number {
  return route.passengers.reduce(
    (sum, p) => sum + passengerTotal(route.fare_per_person, p.idadi, route.trip_type),
    0
  );
}

export function taxiExpenseTotal(t: Pick<TaxiExpense, "number_of_trips" | "cost_per_trip">): number {
  return (t.number_of_trips || 0) * (t.cost_per_trip || 0);
}

export function mizigoItemTotal(m: Pick<MizigoItem, "quantity" | "unit_cost">): number {
  return (m.quantity || 0) * (m.unit_cost || 0);
}

export function nauliTotal(routes: TravelRoute[]): number {
  return routes.reduce((sum, r) => sum + routeSubtotal(r), 0);
}

export function taxiTotal(items: TaxiExpense[]): number {
  return items.reduce((sum, t) => sum + taxiExpenseTotal(t), 0);
}

export function mizigoTotal(items: MizigoItem[]): number {
  return items.reduce((sum, m) => sum + mizigoItemTotal(m), 0);
}

export function jumlaKuu(routes: TravelRoute[], taxi: TaxiExpense[], mizigo: MizigoItem[]): number {
  return nauliTotal(routes) + taxiTotal(taxi) + mizigoTotal(mizigo);
}

// Thousands-separated formatting, e.g. "85,000".
export function formatTZS(n: number): string {
  return Math.round(n || 0).toLocaleString("en-US");
}

// MCHANGANUO text rendering: "85,000 × 2" (idadi = 1) or "85,000 × 4×2"
// (idadi > 1), i.e. fare × trips, or fare × idadi × trips.
export function mchanganuoText(farePerPerson: number, idadi: number, tripType: TripType): string {
  const trips = tripsForType(tripType);
  const fare = formatTZS(farePerPerson);
  if (idadi === 1) return `${fare} × ${trips}`;
  return `${fare} × ${idadi}×${trips}`;
}
