/**
 * Two-pane page body. In landscape the intro sits in a sticky left column
 * beside the content, like an iPadOS split view; in portrait it stacks.
 */
export default function SplitLayout({ intro, children }: { intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="safe-bottom mx-auto max-w-[76rem] px-6 pb-24 pt-4 sm:px-10 lg:grid lg:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)] lg:gap-16 lg:px-14 lg:pt-8">
      <div className="lg:sticky lg:top-24 lg:self-start">{intro}</div>
      <div className="mt-12 max-w-2xl space-y-10 lg:mt-0">{children}</div>
    </main>
  );
}
