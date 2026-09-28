import type { ReactNode } from "react";
import { categoryColor } from "../../colors";

/** The colored square of a category. */
export function Swatch({ category }: { category: string }) {
  return <span className="swatch" style={{ background: categoryColor(category) }} />;
}

/** Swatch + category name (`.rule-cat`); `children` replaces the plain name. */
export function CategoryTag({ category, title, children }: { category: string; title?: string; children?: ReactNode }) {
  return (
    <span className="rule-cat" title={title}>
      <Swatch category={category} />
      {children ?? category}
    </span>
  );
}
