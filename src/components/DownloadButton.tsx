import { Icon } from "./Icon";

export function DownloadButton({ url, quiet, large }: { url: string; quiet?: boolean; large?: boolean }) {
  return (
    <a
      className={`download-btn${quiet ? " quiet" : ""}${large ? " lg" : ""}`}
      href={url}
      download
      title="Wydatki na Windows — działa offline, dane zostają na Twoim komputerze"
    >
      <Icon name="download" size={16} />
      <span>Pobierz aplikację</span>
    </a>
  );
}
