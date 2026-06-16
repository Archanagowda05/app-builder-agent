export default function ErrorBanner({ error, onRetry }) {
  if (!error) return null;

  return (
    <div className="glass error-banner">
      <div className="error-banner-icon">!</div>
      <div className="error-banner-body">
        <div className="error-banner-message">{error.message}</div>
        {error.retryable && (
          <button className="error-banner-retry" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
