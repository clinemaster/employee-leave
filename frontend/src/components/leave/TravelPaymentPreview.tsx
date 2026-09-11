import type { MizigoItem, TaxiExpense, TravelRoute } from "@/types";
import {
  formatTZS,
  jumlaKuu,
  mchanganuoText,
  mizigoItemTotal,
  mizigoTotal,
  nauliTotal,
  passengerTotal,
  taxiExpenseTotal,
  taxiTotal,
} from "@/utils/travelPayment";

// Read-only rendering of "JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO" —
// WAHUSIKA | IDADI | MCHANGANUO | JUMLA columns, matching the paper form's
// layout. Reused inside the Travel Payment Request step's live summary, the
// Review & Submit step, and (later) the application detail page. Prefers a
// server-computed `total`/`subtotal` when present (once the application has
// been saved), falling back to the client-side calculation otherwise so the
// preview never looks broken before the first save.
export function TravelPaymentPreview({
  routes,
  taxi,
  mizigo,
}: {
  routes: TravelRoute[];
  taxi: TaxiExpense[];
  mizigo: MizigoItem[];
}) {
  const nauli = nauliTotal(routes);
  const taxiSum = taxiTotal(taxi);
  const mizigoSum = mizigoTotal(mizigo);
  const grandTotal = jumlaKuu(routes, taxi, mizigo);

  return (
    <div className="space-y-4">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2 pr-4">WAHUSIKA</th>
            <th className="py-2 pr-4">IDADI</th>
            <th className="py-2 pr-4">MCHANGANUO</th>
            <th className="py-2 pr-4 text-right">JUMLA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {routes.length === 0 && taxi.length === 0 && mizigo.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-3 text-gray-500">
                No travel payment items added.
              </td>
            </tr>
          ) : null}
          {routes.map((route, rIndex) => (
            <RoutePreviewRows key={route.id ?? `route-${rIndex}`} route={route} index={rIndex} />
          ))}
          {taxi.map((t, index) => (
            <tr key={t.id ?? `taxi-${index}`}>
              <td className="py-2 pr-4">TAXI{t.description ? ` — ${t.description}` : ""}</td>
              <td className="py-2 pr-4">{t.number_of_trips}</td>
              <td className="py-2 pr-4">
                {formatTZS(t.cost_per_trip)} × {t.number_of_trips}
              </td>
              <td className="py-2 pr-4 text-right font-medium">
                {formatTZS(t.total ?? taxiExpenseTotal(t))}
              </td>
            </tr>
          ))}
          {mizigo.map((m, index) => (
            <tr key={m.id ?? `mizigo-${index}`}>
              <td className="py-2 pr-4">MIZIGO — {m.description || "-"}</td>
              <td className="py-2 pr-4">{m.quantity}</td>
              <td className="py-2 pr-4">
                {formatTZS(m.unit_cost)} × {m.quantity}
              </td>
              <td className="py-2 pr-4 text-right font-medium">
                {formatTZS(m.total ?? mizigoItemTotal(m))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <SummaryRow label="NAULI" value={nauli} />
        <SummaryRow label="TAXI" value={taxiSum} />
        <SummaryRow label="MIZIGO" value={mizigoSum} />
        <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-semibold text-gray-900">
          <span>JUMLA KUU</span>
          <span>{formatTZS(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function RoutePreviewRows({ route, index }: { route: TravelRoute; index: number }) {
  const label = `NAULI ${index + 1}: ${route.from_place || "?"} → ${route.to_place || "?"}`;
  return (
    <>
      {route.passengers.map((p, pIndex) => (
        <tr key={p.id ?? `${index}-${pIndex}`}>
          <td className="py-2 pr-4">
            {pIndex === 0 ? label : ""}
            {pIndex === 0 ? <br /> : null}
            <span className="text-gray-500">{p.person_type_name ?? `Person type ${p.person_type}`}</span>
          </td>
          <td className="py-2 pr-4">{p.idadi}</td>
          <td className="py-2 pr-4">{mchanganuoText(route.fare_per_person, p.idadi, route.trip_type)}</td>
          <td className="py-2 pr-4 text-right font-medium">
            {formatTZS(p.total ?? passengerTotal(route.fare_per_person, p.idadi, route.trip_type))}
          </td>
        </tr>
      ))}
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-gray-700">
      <span>{label}</span>
      <span className="font-medium">{formatTZS(value)}</span>
    </div>
  );
}
