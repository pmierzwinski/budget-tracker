import type { IconName } from "../ui/Icon";
import { CategoriesPage } from "../pages/categories/CategoriesPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { ImportPage } from "../pages/import/ImportPage";
import { PaymentsPage } from "../pages/payments/PaymentsPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { StatsPage } from "../pages/stats/StatsPage";
import { getContext } from "./AppContext";

const groups = {
  Analiza: [
    { id: "dashboard", label: "Przegląd", icon: "dashboard", component: DashboardPage, followsAccount: true },
    { id: "stats", label: "Statystyki", icon: "trends", component: StatsPage, followsAccount: true },
    { id: "transactions", label: "Płatności", icon: "list", component: PaymentsPage, followsAccount: true },
    { id: "limits", label: "Kategorie", icon: "tag", component: CategoriesPage, followsAccount: true },
  ],
  Dane: [
    { id: "import", label: "Import", icon: "upload", component: ImportPage, followsAccount: false },
    { id: "settings", label: "Ustawienia", icon: "settings", component: SettingsPage, followsAccount: false },
  ],
} as const satisfies Record<string, readonly { id: string; label: string; icon: IconName; component: () => unknown; followsAccount: boolean }[]>;

export type Page = (typeof groups)[keyof typeof groups][number]["id"];

export type SettingsTab = "ai" | "accounts" | "bank" | "charts" | "app";

export type Navigate = (page: Page, tab?: SettingsTab) => void;

/** Screens. `pages.link("dashboard")` returns that screen. */
export const pages = {
  groups,
  link(id: Page) {
    for (const group of Object.values(groups)) {
      for (const link of group) {
        if (link.id === id) return link;
      }
    }
    throw new Error(`Nie ma strony ${id}`);
  },
};

/** Current screen. Remounts when `currentPage.key` changes. */
export function PageManager() {
  const { currentPage } = getContext();
  const Page = pages.link(currentPage.id).component;
  return (
    <div className="page-host" key={currentPage.key}>
      <Page />
    </div>
  );
}
