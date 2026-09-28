import { Icon } from "../Icon";

/** The ok/error banners under a page or card header. `onDismiss` adds a close button to the error. */
export function Notices({ message, error, onDismiss }: { message?: string; error?: string; onDismiss?: () => void }) {
  return (
    <>
      {message ? <p className="banner ok">{message}</p> : null}
      {error ? (
        onDismiss ? (
          <p className="banner error dismissible">
            {error}
            <button type="button" className="icon-btn" aria-label="Zamknij" onClick={onDismiss}>
              <Icon name="close" size={16} />
            </button>
          </p>
        ) : (
          <p className="banner error">{error}</p>
        )
      ) : null}
    </>
  );
}
