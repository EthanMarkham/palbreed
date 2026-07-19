type StatusBannerProps = {
  kind: "working" | "error";
  message: string;
};

export default function StatusBanner({ kind, message }: StatusBannerProps) {
  return (
    <div className={`status-banner is-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {kind === "working" ? <span className="status-spinner" /> : <span>!</span>}
      <p>{message}</p>
    </div>
  );
}
