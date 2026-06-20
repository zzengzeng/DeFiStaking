const STEPS = [
  {
    step: "1",
    title: "质押代币",
    desc: "选择灵活池或锁仓池，将 TokenA / TokenB 存入协议。",
  },
  {
    step: "2",
    title: "赚取奖励",
    desc: "按池内份额自动累积 TokenB 奖励，APR 随池状态动态更新。",
  },
  {
    step: "3",
    title: "领取、复利或赎回",
    desc: "领取 TokenB 奖励，或一键复利到锁仓池；灵活池随存随取，锁仓池满期费率更优。",
  },
] as const;

type Layout = "grid" | "stack";

/** 三步说明 */
export function HowItWorks({
  align = "center",
  layout = "grid",
}: {
  align?: "center" | "left";
  layout?: Layout;
}) {
  const centered = align === "center";

  if (layout === "stack") {
    return (
      <section className="dp-card overflow-hidden">
        <div className="border-b border-[var(--dp-border)] px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-zinc-100">如何运作</h2>
          <p className="mt-1 text-sm text-zinc-500">存入 → 赚奖励 → 取出，无需直接接触合约细节。</p>
        </div>
        <ol className="divide-y divide-[var(--dp-border)]">
          {STEPS.map((s) => (
            <li key={s.step} className="flex gap-4 px-5 py-5 sm:px-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dp-accent-muted)] text-sm font-bold text-dp-accent">
                {s.step}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-zinc-100">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section>
      <h2 className={`text-lg font-semibold text-zinc-200 sm:text-xl ${centered ? "text-center" : ""}`}>
        如何运作
      </h2>
      <p
        className={`mt-2 text-sm text-zinc-500 ${centered ? "mx-auto max-w-lg text-center" : "max-w-2xl"}`}
      >
        存入 → 赚奖励 → 取出，无需直接接触合约细节。
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.step} className={`dp-card p-5 ${centered ? "text-center sm:text-left" : ""}`}>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-[var(--dp-accent-muted)] text-sm font-bold text-dp-accent ${centered ? "mx-auto sm:mx-0" : ""}`}
            >
              {s.step}
            </div>
            <h3 className="mt-3 font-semibold text-zinc-100">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
