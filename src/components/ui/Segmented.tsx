/** A group of toggle buttons (`.segmented`), one of them active. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  small,
  className,
}: {
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  small?: boolean;
  className?: string;
}) {
  return (
    <div className={["segmented", small ? "sm" : "", className || ""].filter(Boolean).join(" ")} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? "active" : undefined}
          aria-pressed={value === option.id}
          title={option.title}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
