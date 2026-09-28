// Result messages shared by several screens.
import type { AiCategorizeResult, DemoResult } from "./types";

export function aiCategorizedMessage(result: AiCategorizeResult): string {
  return result.updated
    ? `AI ustawiło kategorię dla ${result.updated} płatności (${result.groups} odbiorców). Zostało ${result.remaining} jako Inne.`
    : "AI nie zmieniło kategorii — nic nie pasowało do istniejących kategorii.";
}

export function demoAddedMessage(result: DemoResult, uncategorized: boolean): string {
  return `Dodano „${result.account.name}” z ${result.imported} przykładowymi płatnościami z ostatnich 6 miesięcy${
    uncategorized ? " — wszystkie w „Inne”" : ""
  }.`;
}
