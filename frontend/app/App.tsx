import { openDatabase } from "../db";
import { AppContext } from "./AppContext";
import { getAppContext } from "./getAppContext";
import { Layout } from "./layout/Layout";
import { PageManager } from "./PageManager";

const database = openDatabase();

export function App() {
  const { context, error } = getAppContext(database);
  if (error) return <p className="banner error">Nie udało się otworzyć aplikacji: {error}</p>;
  if (!context) return <p className="muted loading">Ładowanie…</p>;

  return (
    <AppContext.Provider value={context}>
      <Layout>
        <PageManager />
      </Layout>
    </AppContext.Provider>
  );
}
