import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  primary: "bg-amber-700 text-white hover:bg-amber-800 focus:ring-amber-500",
  secondary: "bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-400",
  outline:
    "border border-amber-700 text-amber-700 hover:bg-amber-50 focus:ring-amber-500",
  ghost:
    "text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-400",
};

const SIZES = {
  small: { btn: "h-7  w-7", icon: 14 },
  medium: { btn: "h-9  w-9", icon: 16 },
  large: { btn: "h-11 w-11", icon: 20 },
};

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  "aria-label": string;
}

export const IconButton = ({
  icon: Icon,
  variant = "secondary",
  size = "medium",
  className = "",
  ...props
}: IconButtonProps) => {
  const { btn, icon } = SIZES[size];
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex cursor-pointer items-center justify-center rounded-full transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        btn,
        className
      )}
      {...props}
    >
      <Icon size={icon} />
    </button>
  );
};
