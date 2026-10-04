import Link from 'next/link';

export const metadata = { title: 'Terms of service - Ujjwal Reach' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <article className="card space-y-5 text-sm leading-relaxed text-slate-700">
        <h1 className="text-2xl font-bold text-slate-900">Terms of service</h1>
        <p className="text-xs text-slate-500">Last updated: October 2026</p>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Guidance only</h2>
          <p>
            The scheme lists on this portal are a guide based on the details you enter and on
            information we collected from official sources. Final eligibility and benefits are
            decided by the concerned government department. Always confirm on the official page
            before applying. Schemes change, and some entries may be out of date.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Not a government service</h2>
          <p>
            Ujjwal Reach is a private firm. Using this portal does not create any application with a
            government department and does not guarantee approval of any scheme.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Your responsibilities</h2>
          <p>Enter correct details. Do not enter another person&apos;s details without their permission.</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Liability</h2>
          <p>
            We take care to keep the information correct but we are not responsible for decisions
            taken only on the basis of this portal.
          </p>
        </section>

        <Link href="/" className="inline-block font-semibold text-blue-900 hover:text-orange-600">
          ← Back to home
        </Link>
      </article>
    </main>
  );
}
