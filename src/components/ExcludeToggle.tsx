import { Icon } from "./Icon";

export function ExcludeToggle({
  excluded,
  onToggle,
  compact,
}: {
  excluded: boolean;
  onToggle: (next: boolean) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`exclude-toggle${excluded ? " on" : ""}${compact ? " compact" : ""}`}
      aria-pressed={excluded}
      title={
        excluded
          ? "Ukryta w statystykach — kliknij, żeby znów liczyła się do wykresów"
          : "Ukryj w statystykach (np. duży jednorazowy wydatek albo przelew między swoimi kontami)"
      }
      onClick={(event) => {
        event.stopPropagation();
        onToggle(!excluded);
      }}
    >
      <Icon name={excluded ? "eyeOff" : "eye"} size={compact ? 13 : 15} />
      {excluded ? "ukryta" : compact ? "ukryj" : "Ukryj"}
    </button>
  );
}
