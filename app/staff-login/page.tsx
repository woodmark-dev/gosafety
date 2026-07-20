"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type StaffLoginResponse = {
  user?: {
    id: string;
    email: string;
    fullName: string;
    firstName: string;
    lastName: string;
  };
  created?: boolean;
  message?: string;
};

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await response.json()) as StaffLoginResponse;

      if (!response.ok || !data.user) {
        throw new Error(data.message ?? "Unable to sign in");
      }

      localStorage.setItem(
        "gosafety_staff_session",
        JSON.stringify({
          user: data.user,
          signedInAt: new Date().toISOString(),
        })
      );

      router.push("/dashboard/reports");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-svh bg-[#f3f5f2] p-2 text-[#1a2433] md:p-4">
      <section className="relative mx-auto flex min-h-[calc(100svh-1rem)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[22px] border border-[#e5ece6] bg-white shadow-[0_18px_42px_rgba(8,24,16,0.07)] md:min-h-[calc(100svh-2rem)] md:rounded-[26px]">
        <header className="relative z-20 flex h-[72px] items-center border-b border-[#e5ece6] bg-white px-4 md:h-[78px] md:px-7">
          <Link href="/" className="flex items-center gap-3 md:gap-5" aria-label="Go to home page">
            <Image
              src="/nnpc-logo.svg"
              alt="NNPC logo"
              width={128}
              height={42}
              className="h-7 w-auto md:h-8"
              priority
            />
            <div className="h-7 w-px bg-[#d7ddd8]" />
            <div>
              <p className="text-[9px] font-semibold tracking-[0.16em] text-[#0f7a44] md:text-[10px]">
                GOSAFETY
              </p>
              <p className="text-[11px] leading-none text-[#4f5f65] md:text-[13px]">
                Safety intelligence for every worksite
              </p>
            </div>
          </Link>
        </header>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_55%_35%,#f8fbf8_0%,#eef5ef_44%,#e9f2ea_70%,#ecf4ed_100%)] px-3 py-4 md:px-7 md:py-7">
          <div className="pointer-events-none absolute -left-20 bottom-[-120px] h-[280px] w-[280px] rotate-[40deg] bg-[#04683a] md:-left-14 md:bottom-[-130px] md:h-[380px] md:w-[380px]" />
          <div className="pointer-events-none absolute right-0 top-0 h-[68px] w-[100px] bg-[#067744] md:h-[132px] md:w-[166px]" />
          <div className="pointer-events-none absolute right-0 top-[30px] h-[42px] w-[72px] bg-[#f4ce15] md:top-[62px] md:h-[68px] md:w-[106px]" />
          <div className="pointer-events-none absolute right-0 top-[58px] h-[42px] w-[62px] bg-[#e6342a] md:top-[102px] md:h-[62px] md:w-[92px]" />
          <div className="pointer-events-none absolute bottom-6 left-6 hidden h-16 w-16 opacity-25 md:block">
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 25 }).map((_, dotIndex) => (
                <span key={dotIndex} className="h-1 w-1 rounded-full bg-[#56bb8b]" />
              ))}
            </div>
          </div>

          <div className="relative z-20 w-full max-w-[560px] rounded-[20px] border border-[#e3ebe5] bg-white p-4 shadow-[0_16px_38px_rgba(7,35,18,0.12)] md:p-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#12663e] md:text-[11px]">
              GoSafety
            </p>
            <h1 className="mt-1.5 text-[36px] font-semibold leading-[1.08] text-[#0d5738] md:text-[44px]">
              Staff Login
            </h1>
            <p className="mt-2.5 max-w-[440px] text-[15px] leading-[1.45] text-[#334654] md:text-[18px]">
              Enter your NNPC staff email. No password required for this TigerThon demo.
            </p>

            <form className="mt-5 space-y-3.5" onSubmit={handleSubmit}>
              <label
                className="block text-[13px] font-semibold text-[#145333]"
                htmlFor="staff-email"
              >
                Staff email address
              </label>

              <div className="flex h-11 items-center gap-2.5 rounded-xl border border-[#d7e0db] bg-white px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] md:h-12">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4.5 w-4.5 text-[#1f8151] md:h-5 md:w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
                <input
                  id="staff-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="FirstName.LastName@nnpcgroup.com"
                  className="h-full w-full border-0 bg-transparent text-[14px] text-[#203647] outline-none placeholder:text-[#95a3ad] md:text-[15px]"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#05683a] text-[21px] font-semibold text-white transition hover:bg-[#045730] disabled:cursor-not-allowed disabled:opacity-70 md:h-12 md:text-[24px]"
              >
                <span>{busy ? "Signing in..." : "Continue"}</span>
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 md:h-5 md:w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 10h12" />
                  <path d="M11 5l5 5-5 5" />
                </svg>
              </button>

              {error ? (
                <p className="rounded-xl border border-[#f4d4d4] bg-[#fff5f5] p-3 text-[12px] text-[#a22e2e] md:text-[13px]">
                  {error}
                </p>
              ) : null}
            </form>

            <div className="mt-5 flex items-start gap-2 text-[11px] text-[#4d6368] md:text-[12px]">
              <span className="mt-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#4f9c72] text-[10px] font-semibold text-[#0f7442] md:h-4 md:w-4 md:text-[11px]">
                i
              </span>
              <p>
                Format required:{" "}
                <span className="font-semibold text-[#115a38]">
                  firstName.LastName@nnpcgroup.com
                </span>
              </p>
            </div>

            <div className="mt-4 border-t border-[#e7ede8] pt-3.5">
              <div className="flex items-center justify-between gap-4 text-[13px] md:text-[14px]">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 font-semibold text-[#105f3c] transition hover:opacity-80"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5 md:h-4 md:w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 9.5l7-6 7 6" />
                    <path d="M5 8.5V16h10V8.5" />
                  </svg>
                  <span>Back to home</span>
                </Link>
                <Link
                  href="/report"
                  className="inline-flex items-center gap-2 font-semibold text-[#d1322e] transition hover:opacity-80"
                >
                  <span>Report as visitor</span>
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5 md:h-4 md:w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 10h12" />
                    <path d="M11 5l5 5-5 5" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
