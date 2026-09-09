import { Card } from "@/components/ui/Card";

export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-2xl font-semibold text-gray-900">{value}</span>
    </Card>
  );
}
