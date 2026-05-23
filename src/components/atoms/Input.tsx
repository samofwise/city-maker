import type { InputHTMLAttributes } from "react";

export const Input = ({
  label,
  error,
  className = "",
  id,
  ...props
}: InputProps) => {
  const inputId = id ?? `input-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-lg border px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none ${error ? "border-red-500" : "border-gray-300"} ${className} `}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
