export default function BootScreen() {
  return (
    <main className="boot-stage" aria-busy="true" aria-label="Đang tải">
      <span className="spin h-9 w-9 rounded-full border-4 border-border border-t-accent" />
    </main>
  );
}
