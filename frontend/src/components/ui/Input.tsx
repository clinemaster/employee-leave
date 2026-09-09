import { type InputHTMLAttributes, type LabelHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, error, ...props }, ref) => (
  <div className="w-full">
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500",
        error ? "border-red-400" : "border-gray-300",
        className
      )}
      {...props}
    />
    {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
  </div>
));
Input.displayName = "Input";

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="mb-1 block text-sm font-medium text-gray-700" {...props} />;
}
