import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Layout, type Page } from "./components/Layout";
import { BankPage } from "./pages/BankPage";
import { Categories } from "./pages/Categories";
import { Dashboard } from "./pages/Dashboard";
import { ImportPage } from "./pages/ImportPage";
import { Trends } from "./pages/Trends";
import { Transactions } from "./pages/Transactions";
import "./index.css";

function readBankCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("bank") === "connected";
  if (connected) window.history.replaceState({}, "", "/");
  return connected;
}

function App() {
  const [autoSync] = useState(readBankCallback);
  const [page, setPage] = useState<Page>(autoSync ? "bank" : "dashboard");

  return (
    <Layout page={page} onPage={setPage}>
      {page === "dashboard" && <Dashboard onImport={() => setPage("import")} />}
      {page === "trends" && <Trends />}
      {page === "transactions" && <Transactions />}
      {page === "import" && <ImportPage onImported={() => setPage("transactions")} />}
      {page === "categories" && <Categories />}
      {page === "bank" && <BankPage autoSync={autoSync} />}
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
