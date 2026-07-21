import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space-grotesk",
});

export default function Home() {
  return (
    <main
      className={`${space.variable} min-h-screen bg-[#f0f2f4] px-0 py-0 text-slate-900 md:px-0 md:py-0`}
    >
      <div className="mx-auto max-w-[1380px] overflow-hidden rounded-[20px] border border-[#d8dee5] bg-white shadow-[0_24px_65px_-48px_rgba(17,45,71,0.7)] lg:min-h-[calc(100vh-2rem)]">
        <header className="flex items-center justify-between border-b border-[#e4e9ef] bg-white px-3 py-2.5 md:px-5 md:py-3">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 md:gap-5"
            aria-label="Go to home page"
          >
            <Image
              src="/nnpc-logo.svg"
              alt="NNPC"
              width={188}
              height={62}
              className="h-10 w-auto rounded-sm md:h-11"
              priority
            />
            <span className="h-8 w-px bg-[#cfd6de]" />
            <div className="min-w-0">
              <p className="truncate text-[21px] font-bold uppercase tracking-[0.05em] text-[#0a7e49] md:text-[23px]">
                GOSAFETY
              </p>
              <p className="text-[9px] text-[#4d5d6f] md:text-[11px]">
                Safety intelligence for every worksite
              </p>
            </div>
          </Link>
        </header>

        <section className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
          <article className="relative overflow-hidden bg-gradient-to-br from-[#085a35] via-[#00683c] to-[#00492a] px-5 pb-6 pt-8 text-white md:px-8 md:pt-9 lg:pb-7">
            <div className="pointer-events-none absolute -left-8 bottom-10 h-32 w-28 rounded-full border border-emerald-300/15" />
            <div className="pointer-events-none absolute bottom-6 left-4 grid grid-cols-8 gap-1 opacity-30">
              {Array.from({ length: 40 }).map((_, index) => (
                <span key={index} className="h-1 w-1 rounded-full bg-[#2ccf7f]" />
              ))}
            </div>
            <div className="pointer-events-none absolute -right-28 -top-24 h-[480px] w-[480px] rounded-full bg-[#26a754]/45" />
            <div className="pointer-events-none absolute -right-20 top-0 h-full w-[360px] rotate-[20deg] bg-gradient-to-b from-[#007b47]/0 via-[#28a655]/45 to-[#004d2d]/0" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 border-b-[125px] border-l-[155px] border-b-[#ffde00] border-l-transparent md:border-b-[150px] md:border-l-[190px]" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 border-b-[80px] border-l-[98px] border-b-[#e6202a] border-l-transparent md:border-b-[95px] md:border-l-[116px]" />

            <div className="relative z-10 max-w-[720px]">
              <p className="text-xs font-bold uppercase tracking-[0.05em] text-[#ffe127] md:text-sm">
                FASTER HAZARD RESPONSE
              </p>
              <h1 className="mt-2.5 max-w-[620px] text-[34px] font-bold leading-[1.06] md:text-[40px] lg:text-[46px]">
                One home for <span className="text-[#ffe127]">safe</span> reporting and rapid
                action.
              </h1>
              <p className="mt-3.5 max-w-[570px] text-[14px] leading-[1.45] text-[#d8ece0] md:text-[16px]">
                Choose your path in seconds. Staff can log in to report incidence and coordinate
                operational response, while visitors can report incidents instantly from the field.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Link
                  href="/staff-login"
                  className="rounded-3xl border border-emerald-200/45 bg-gradient-to-br from-[#0a7e49] to-[#0a663f] p-4 shadow-[0_20px_35px_-26px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#ffe23f] md:text-[12px]">
                        STAFF ACCESS
                      </p>
                      <p className="text-[23px] font-bold leading-tight md:text-[26px]">
                        Login as Staff
                      </p>
                      <p className="text-[13px] text-[#d8ece0] md:text-[14px]">
                        Report incidence, manage queue, assign teams, track SLAs.
                      </p>
                    </div>
                    <span className="mt-1.5 text-[24px] text-white/90">&gt;</span>
                  </div>
                  <p className="mt-3 text-[18px] font-bold text-[#ffe127] md:text-[20px]">
                    Open dashboard -&gt;
                  </p>
                </Link>

                <Link
                  href="/visitor/report"
                  className="rounded-3xl border border-slate-200 bg-white p-4 text-[#181f2a] shadow-[0_20px_35px_-26px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#ef1f25] md:text-[12px]">
                        VISITOR ACCESS
                      </p>
                      <p className="text-[23px] font-bold leading-tight md:text-[26px]">
                        Report as Visitor
                      </p>
                      <p className="text-[13px] text-[#3a4653] md:text-[14px]">
                        Capture photos, location, and submit securely.
                      </p>
                    </div>
                    <span className="mt-1.5 text-[24px] text-[#121822]">&gt;</span>
                  </div>
                  <p className="mt-3 text-[18px] font-bold text-[#ef1f25] md:text-[20px]">
                    Start report -&gt;
                  </p>
                </Link>
              </div>
            </div>
          </article>

          <aside className="grid gap-3 bg-[#f8fafb] p-4 md:p-4 lg:content-start lg:bg-white lg:p-4">
            {[
              {
                label: "VISITOR FLOW",
                title: "Report in under 2 minutes",
                desc: "Structured steps for photos, auto-detected address, and extra location notes.",
                iconBg: "bg-[#0a7e49]",
                accent: "border-l-[#0a7e49]",
                icon: "O",
              },
              {
                label: "STAFF FLOW",
                title: "Operational control center",
                desc: "View live incident details, timelines, severity, and action status in one place.",
                iconBg: "bg-[#ffcf00]",
                accent: "border-l-[#ffcf00]",
                icon: "#",
              },
              {
                label: "READY EVERYWHERE",
                title: "PWA + offline queue support",
                desc: "Capture incidents on unstable networks and sync automatically when back online.",
                iconBg: "bg-[#ef1f25]",
                accent: "border-l-[#ef1f25]",
                icon: "~",
              },
            ].map((item) => (
              <div
                key={item.title}
                className={`rounded-3xl border border-slate-200 bg-white p-3.5 shadow-[0_12px_30px_-25px_rgba(15,31,52,0.45)] lg:border-l-4 ${item.accent}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-4">
                    <span
                      className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base text-white ${item.iconBg}`}
                    >
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#0a7e49]">
                        {item.label}
                      </p>
                      <p className="mt-1 text-[19px] font-bold leading-tight text-[#151c27]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-[12px] leading-snug text-[#425264]">{item.desc}</p>
                    </div>
                  </div>
                  <span className="text-[20px] text-[#2d3745]">&gt;</span>
                </div>
              </div>
            ))}
          </aside>
        </section>

        <footer className="grid gap-3 border-t border-emerald-700/25 bg-gradient-to-r from-[#045835] via-[#035b35] to-[#02462a] px-4 py-3 text-white md:grid-cols-4 md:px-6 md:py-3">
          {[
            { title: "Secure by design", body: "Your data is protected always." },
            { title: "Works offline", body: "Capture now, sync later when back online." },
            { title: "Real-time alerts", body: "Instant notifications for faster response." },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 border-white/20 md:border-r md:pr-4"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm">
                *
              </span>
              <div>
                <p className="text-[11px] font-bold md:text-xs">{item.title}</p>
                <p className="text-[10px] text-emerald-100 md:text-[11px]">{item.body}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-start md:justify-end">
            <span className="text-xl font-bold tracking-wide md:text-[22px]">NNPC</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
