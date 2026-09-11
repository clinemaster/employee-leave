"use client";

import { useFieldArray } from "react-hook-form";
import type { Control, UseFormRegister, UseFormWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { useGetPersonTypesQuery } from "@/features/leave/personTypesApi";
import type { TravelPaymentFormValues } from "@/lib/validation/leaveApplication";
import {
  formatTZS,
  jumlaKuu,
  mchanganuoText,
  mizigoItemTotal,
  mizigoTotal,
  nauliTotal,
  passengerTotal,
  routeSubtotal,
  taxiExpenseTotal,
  taxiTotal,
} from "@/utils/travelPayment";

// Step 4 of the multi-step leave application form: "Travel Payment Request"
// (JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO) — always shown, not gated on
// the `travel_assistance` checkbox. NAULI (routes) / TAXI / MIZIGO
// (luggage), each with repeatable line items and a live, never-hand-typed
// total. Person types (Wahusika) come from /api/person-types/, not a
// hardcoded list, so admin-added types show up automatically.

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

  function addRoute() {
    routesArray.append({
      from_place: "",
      to_place: "",
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
      <h2 className="text-base font-semibold text-gray-900">Travel Payment Request</h2>
      <p className="text-xs text-gray-500">
        JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO — fare (NAULI), taxi, and luggage (MIZIGO)
        expenses. Totals are computed automatically; enter Idadi (count), fares, and costs only.
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
          />
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={addRoute}>
            + Add {routesArray.fields.length === 0 ? "Route" : "Another Route"}
          </Button>
          <p className="text-sm font-medium text-gray-700">NAULI subtotal: {formatTZS(nauli)}</p>
        </div>
      </section>

      {/* TAXI */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">TAXI</h3>
        {taxiArray.fields.length === 0 ? <p className="text-sm text-gray-500">No taxi expenses added yet.</p> : null}
        {taxiArray.fields.map((field, index) => {
          const row = taxi?.[index];
          const total = row ? taxiExpenseTotal(row) : 0;
          return (
            <div key={field.id} className="grid grid-cols-5 items-end gap-3 rounded-md border border-gray-100 p-3">
              <div className="col-span-2">
                <Label htmlFor={`taxi-${index}-description`}>Description (optional)</Label>
                <Input id={`taxi-${index}-description`} {...register(`taxi_expenses.${index}.description` as const)} />
              </div>
              <div>
                <Label htmlFor={`taxi-${index}-trips`}>Number of Trips</Label>
                <Input
                  id={`taxi-${index}-trips`}
                  type="number"
                  min={0}
                  {...register(`taxi_expenses.${index}.number_of_trips` as const, { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label htmlFor={`taxi-${index}-cost`}>Cost per Trip (TZS)</Label>
                <Input
                  id={`taxi-${index}-cost`}
                  type="number"
                  min={0}
                  {...register(`taxi_expenses.${index}.cost_per_trip` as const, { valueAsNumber: true })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700">{formatTZS(total)}</p>
                <Button type="button" variant="danger" onClick={() => taxiArray.remove(index)}>
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={() => taxiArray.append({ description: "", number_of_trips: 1, cost_per_trip: 0 })}
          >
            + Add Taxi Expense
          </Button>
          <p className="text-sm font-medium text-gray-700">TAXI subtotal: {formatTZS(taxiSum)}</p>
        </div>
      </section>

      {/* MIZIGO */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">MIZIGO (Luggage)</h3>
        {mizigoArray.fields.length === 0 ? <p className="text-sm text-gray-500">No luggage items added yet.</p> : null}
        {mizigoArray.fields.map((field, index) => {
          const row = mizigo?.[index];
          const total = row ? mizigoItemTotal(row) : 0;
          return (
            <div key={field.id} className="grid grid-cols-5 items-end gap-3 rounded-md border border-gray-100 p-3">
              <div className="col-span-2">
                <Label htmlFor={`mizigo-${index}-description`}>Description</Label>
                <Input id={`mizigo-${index}-description`} {...register(`mizigo_items.${index}.description` as const)} />
              </div>
              <div>
                <Label htmlFor={`mizigo-${index}-quantity`}>Quantity</Label>
                <Input
                  id={`mizigo-${index}-quantity`}
                  type="number"
                  min={0}
                  {...register(`mizigo_items.${index}.quantity` as const, { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label htmlFor={`mizigo-${index}-unit-cost`}>Unit Cost (TZS)</Label>
                <Input
                  id={`mizigo-${index}-unit-cost`}
                  type="number"
                  min={0}
                  {...register(`mizigo_items.${index}.unit_cost` as const, { valueAsNumber: true })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700">{formatTZS(total)}</p>
                <Button type="button" variant="danger" onClick={() => mizigoArray.remove(index)}>
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={() => mizigoArray.append({ description: "", quantity: 1, unit_cost: 0 })}
          >
            + Add Luggage Item
          </Button>
          <p className="text-sm font-medium text-gray-700">MIZIGO subtotal: {formatTZS(mizigoSum)}</p>
        </div>
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
}: StepProps & {
  routeIndex: number;
  onRemove: () => void;
  personTypes: { id: number; name: string; is_active: boolean; sort_order: number }[];
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
          <Input id={`route-${routeIndex}-from`} {...register(`travel_routes.${routeIndex}.from_place` as const)} />
        </div>
        <div>
          <Label htmlFor={`route-${routeIndex}-to`}>To</Label>
          <Input id={`route-${routeIndex}-to`} {...register(`travel_routes.${routeIndex}.to_place` as const)} />
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
