export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Trend Tracker
      </h1>
      <p className="max-w-md text-balance text-muted-foreground">
        Bilingual (TH / EN) trend discovery. Scaffold is ready — sources,
        clustering, scoring and the dashboard come next.
      </p>
    </main>
  );
}
