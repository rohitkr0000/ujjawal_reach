import Link from 'next/link';

export const metadata = { title: 'Privacy policy - Ujjwal Reach' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <article className="card space-y-5 text-sm leading-relaxed text-slate-700">
        <h1 className="text-2xl font-bold text-slate-900">Privacy policy</h1>
        <p className="text-xs text-slate-500">Last updated: October 2026</p>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Who we are</h2>
          <p>
            Ujjwal Reach is a private welfare consulting firm. This portal helps you find government
            schemes you may qualify for. We are not a government body.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">What we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              The details you type into the forms: name, mobile number, age, gender, income bracket,
              caste category, education, occupation, address, and the optional
              groups you tick (disability, patient, artisan, homeless, minority).
            </li>
            <li>
              When you submit a form, the details above are stored on our server so that we can
              contact you about your application. The mobile number is not verified by a code.
            </li>
            <li>
              Only if you allow it: which schemes were shown to you and which official links you
              clicked, with a random session id, your device type and the state you chose.
            </li>
          </ul>
          <p className="mt-2">
            We never ask for or store your Aadhaar number. Checking your eligibility happens in your
            browser, and the form is saved on our server when you submit it with the agreement box ticked.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Why we use it</h2>
          <p>
            To show you matching schemes, to contact you
            about your application if you ask us to, and to understand which schemes are useful so
            we can improve the service. We do not sell your data.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Your choices</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Activity tracking is optional and off until you allow it. Clear it by clearing this site&apos;s data in your browser.</li>
            <li>
              You can ask us to delete your saved form and activity records at any time through the
              helpline on the home page.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">How long we keep it</h2>
          <p>
            Submitted forms are kept until you ask us to delete them. Activity records are deleted after
            12 months. Only summary counts that do not identify anyone are kept longer.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Security</h2>
          <p>
            Data is sent over HTTPS and stored with a managed database provider in India. Only
            authorised staff can view saved records, and every view of a person&apos;s activity is
            logged.
          </p>
        </section>

        <Link href="/" className="inline-block font-semibold text-blue-900 hover:text-orange-600">
          ← Back to home
        </Link>
      </article>
    </main>
  );
}
