"use client";

import { useEffect } from "react";
import { useFieldArray } from "react-hook-form";
import type { Control, UseFormRegister, UseFormWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentUser } from "@/features/auth/selectors";
import { useGetPersonTypesQuery } from "@/features/leave/personTypesApi";
import { useGetTravelPaymentSettingsQuery } from "@/features/leave/policiesApi";
import type { TravelPaymentFormValues } from "@/lib/validation/leaveApplication";
import { REGIONS } from "@/types";
import {
  formatTZS,
  jumlaKuu,
  mchanganuoText,
  mizigoTotal,
  nauliTotal,
  passengerTotal,
  routeSubtotal,
  taxiTotal,
} from "@/utils/travelPayment";

// Step 4 of the multi-step leave application form: "Travel Payment Request"
// (JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO) — always shown, not gated on
// the `travel_assistance` checkbox. NAULI (routes) are itemized/employee-
// entered; TAXI and MIZIGO are NOT — they're a fixed, SYSTEM_ADMIN-
// configured amount (see /api/travel-payment-settings/) auto-applied
// whenever this step is reached (it's only reached when travel_assistance
// is checked), shown here read-only. Person types (Wahusika) come from
// /api/person-types/, not a hardcoded list, so admin-added types show up
// automatically.

// Typed against TravelPaymentFormValues (travel_routes/taxi_expenses/
// mizigo_items) only. LeaveApplicationForm's FieldValues type is a superset
// of this shape (same nested schemas) — react-hook-form's own generics
// don't compose cleanly across a parent form and an embedded step
// component with a narrower field-values type, so the caller casts its
// control/register/watch down to this shape at the call site.
type FormValues = TravelPaymentFormValues;

interface StepProps {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
}

export function TravelPaymentStep({ control, register, watch }: StepProps) {
  const { data: personTypes } = useGetPersonTypesQuery();
  const activePersonTypes = [...(personTypes ?? [])]
    .filter((pt) => pt.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const user = useAppSelector(selectCurrentUser);
  // Every new route defaults From -> the employee's work station, To -> their
  // place of domicile, and locks those two fields (read-only) once filled --
  // if either is missing from the profile, that field is left blank and
  // editable instead of locking on an empty value.
  const defaultFrom = user?.work_station_name ?? "";
  const defaultTo = REGIONS.find((r) => r.code === user?.place_of_domicile)?.label ?? "";

  const routesArray = useFieldArray({ control, name: "travel_routes" });
  const taxiArray = useFieldArray({ control, name: "taxi_expenses" });
  const mizigoArray = useFieldArray({ control, name: "mizigo_items" });

  const routes = watch("travel_routes");
  const taxi = watch("taxi_expenses");
  const mizigo = watch("mizigo_items");

  const nauli = nauliTotal(routes ?? []);
  const taxiSum = taxiTotal(taxi ?? []);
  const mizigoSum = mizigoTotal(mizigo ?? []);
  const grandTotal = jumlaKuu(routes ?? [], taxi ?? [], mizigo ?? []);

  // TAXI/MIZIGO are a fixed, SYSTEM_ADMIN-configured amount (see backend
  // apps.leave.models.TravelPaymentSettings), not itemized/employee-entered
  // — mirror them into the (now read-only) taxi_expenses/mizigo_items
  // arrays so the totals/Review preview reflect exactly what the backend
  // will apply (apps.leave.serializers._sync_travel_payment_fixed_amounts).
  // A category left unconfigured (null) gets no row.
  const { data: paymentSettings } = useGetTravelPaymentSettingsQuery();
  useEffect(() => {
    if (!paymentSettings) return;
    taxiArray.replace(
      paymentSettings.taxi_amount != null
        ? [{ description: "Taxi (fixed rate)", number_of_trips: 1, cost_per_trip: paymentSettings.taxi_amount }]
        : []
    );
    mizigoArray.replace(
      paymentSettings.mizigo_amount != null
        ? [{ description: "Mizigo (fixed rate)", quantity: 1, unit_cost: paymentSettings.mizigo_amount }]
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentSettings]);

  function addRoute() {
    // Only the first route defaults to/locks the employee's work station ->
    // place of domicile. Every subsequent route is a separate leg the
    // employee types in themselves, so it starts blank and editable.
    const isFirstRoute = routesArray.fields.length === 0;
    routesArray.append({
      from_place: isFirstRoute ? defaultFrom : "",
      to_place: isFirstRoute ? defaultTo : "",
      fare_per_person: 0,
      trip_type: "ONE_WAY",
      passengers: activePersonTypes.map((pt) => ({
        person_type: pt.id,
        person_type_name: pt.name,
        idadi: 0,
      })),
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-900">Travel Route Payment Request</h2>
      <p className="text-xs text-gray-500">
        JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO — fare (NAULI) is itemized per route; TAXI and
        MIZIGO (luggage) are a fixed amount set by the system administrator.
      </p>

      {/* NAULI */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">NAULI (Routes)</h3>
        {routesArray.fields.length === 0 ? <p className="text-sm text-gray-500">No routes added yet.</p> : null}
        {routesArray.fields.map((field, index) => (
          <RouteCard
            key={field.id}
            control={control}
            register={register}
            watch={watch}
            routeIndex={index}
            onRemove={() => routesArray.remove(index)}
            personTypes={activePersonTypes}
            lockFrom={index === 0 && !!defaultFrom}
            lockTo={index === 0 && !!defaultTo}
          />
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={addRoute}>
            + Add {routesArray.fields.length === 0 ? "Route" : "Another Route"}
          </Button>
          <p className="text-sm font-medium text-gray-700">NAULI subtotal: {formatTZS(nauli)}</p>
        </div>
      </section>

      {/* TAXI — fixed amount, set by SYSTEM_ADMIN, not itemized */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">TAXI</h3>
        {paymentSettings?.taxi_amount != null ? (
          <p className="text-sm text-gray-600">
            Fixed rate amount system confirgure — not editable.
          </p>
        ) : (
          <p className="text-sm text-gray-500">Not configured by the system administrator.</p>
        )}
        <p className="text-sm font-medium text-gray-700">TAXI subtotal: {formatTZS(taxiSum)}</p>
      </section>

      {/* MIZIGO — fixed amount, set by SYSTEM_ADMIN, not itemized */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">MIZIGO (Luggage)</h3>
        {paymentSettings?.mizigo_amount != null ? (
          <p className="text-sm text-gray-600">
            Fixed rate amount system confirgure — not editable.
          </p>
        ) : (
          <p className="text-sm text-gray-500">Not configured by the system administrator.</p>
        )}
        <p className="text-sm font-medium text-gray-700">MIZIGO subtotal: {formatTZS(mizigoSum)}</p>
      </section>

      {/* Live summary */}
      <Card className="sticky bottom-0 bg-blue-50">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <SummaryTile label="NAULI" value={nauli} />
          <SummaryTile label="TAXI" value={taxiSum} />
          <SummaryTile label="MIZIGO" value={mizigoSum} />
          <SummaryTile label="JUMLA KUU" value={grandTotal} emphasize />
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={emphasize ? "text-lg font-bold text-blue-900" : "text-sm font-semibold text-gray-800"}>
        {formatTZS(value)}
      </p>
    </div>
  );
}

function RouteCard({
  control,
  register,
  watch,
  routeIndex,
  onRemove,
  personTypes,
  lockFrom,
  lockTo,
}: StepProps & {
  routeIndex: number;
  onRemove: () => void;
  personTypes: { id: number; name: string; is_active: boolean; sort_order: number }[];
  lockFrom: boolean;
  lockTo: boolean;
}) {
  const passengersArray = useFieldArray({ control, name: `travel_routes.${routeIndex}.passengers` });
  const route = watch(`travel_routes.${routeIndex}`);
  const subtotal = route ? routeSubtotal(route) : 0;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">Route {routeIndex + 1}</h4>
        <Button type="button" variant="danger" onClick={onRemove}>
          Remove Route
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <Label htmlFor={`route-${routeIndex}-from`}>From</Label>
          <Input
            id={`route-${routeIndex}-from`}
            disabled={lockFrom}
            className={lockFrom ? "bg-gray-50 text-gray-600" : undefined}
            {...register(`travel_routes.${routeIndex}.from_place` as const)}
          />
        </div>
        <div>
          <Label htmlFor={`route-${routeIndex}-to`}>To</Label>
          <Input
            id={`route-${routeIndex}-to`}
            disabled={lockTo}
            className={lockTo ? "bg-gray-50 text-gray-600" : undefined}
            {...register(`travel_routes.${routeIndex}.to_place` as const)}
          />
        </div>
        <div>
          <Label htmlFor={`route-${routeIndex}-fare`}>Fare per Person (TZS)</Label>
          <Input
            id={`route-${routeIndex}-fare`}
            type="number"
            min={0}
            {...register(`travel_routes.${routeIndex}.fare_per_person` as const, { valueAsNumber: true })}
          />
        </div>
        <div>
          <Label htmlFor={`route-${routeIndex}-trip-type`}>Trip Type</Label>
          <select
            id={`route-${routeIndex}-trip-type`}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register(`travel_routes.${routeIndex}.trip_type` as const)}
          >
            <option value="ONE_WAY">One Way</option>
            <option value="ROUND_TRIP">Round Trip</option>
          </select>
        </div>
      </div>

      <table className="mt-4 min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2 pr-4">Person Type</th>
            <th className="py-2 pr-4">Idadi</th>
            <th className="py-2 pr-4">Fare</th>
            <th className="py-2 pr-4">Trips</th>
            <th className="py-2 pr-4 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {passengersArray.fields.map((field, pIndex) => {
            const passenger = route?.passengers?.[pIndex];
            const fare = route?.fare_per_person ?? 0;
            const tripType = route?.trip_type ?? "ONE_WAY";
            const idadi = passenger?.idadi ?? 0;
            const trips = tripType === "ROUND_TRIP" ? 2 : 1;
            const total = passengerTotal(fare, idadi, tripType);
            const label = personTypes.find((pt) => pt.id === passenger?.person_type)?.name ?? passenger?.person_type_name;
            return (
              <tr key={field.id}>
                <td className="py-2 pr-4">{label ?? "-"}</td>
                <td className="py-2 pr-4">
                  <Input
                    type="number"
                    min={0}
                    className="w-20"
                    {...register(`travel_routes.${routeIndex}.passengers.${pIndex}.idadi` as const, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td className="py-2 pr-4 text-gray-600">{formatTZS(fare)}</td>
                <td className="py-2 pr-4 text-gray-600">{trips}</td>
                <td className="py-2 pr-4 text-right font-medium">{formatTZS(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-right text-sm font-medium text-gray-700">
        Route subtotal: {formatTZS(subtotal)}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {route?.passengers
          ?.filter((p) => (p?.idadi ?? 0) > 0)
          .map((p) => mchanganuoText(route.fare_per_person, p.idadi, route.trip_type))
          .join(", ") || "-"}
      </p>
    </Card>
  );
}
