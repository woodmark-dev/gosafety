import Link from "next/link";

export default function VisitorNotificationsPage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-3 pt-4 md:px-0 md:pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#c8632f]">
            Visitor
          </p>
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Notifications</h1>
        </div>
        <Link
          href="/visitor/reports"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Back to reports
        </Link>
      </div>

      <article className="rounded-2xl border border-[#e4d8d1] bg-white p-5 shadow-[0_18px_34px_-24px_rgba(15,40,66,0.38)] md:p-7">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff1ea] text-[#c8632f]">
            <svg
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M10 3.6a3.4 3.4 0 00-3.4 3.4v1.1c0 1.8-.4 3.3-1.5 4.4l-.9.9h11.6l-.9-.9c-1.1-1.1-1.5-2.6-1.5-4.4V7A3.4 3.4 0 0010 3.6z" />
              <path d="M8.2 14.5a1.8 1.8 0 003.6 0" />
            </svg>
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#c8632f]">
              Under construction
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Notifications are coming soon
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              This page is being prepared so you can receive report progress updates and follow-up
              messages in one place.
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}
