'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SchemeForm } from '../../../../components/admin/SchemeForm';

function Edit() {
  const id = useSearchParams().get('id');
  return id ? <SchemeForm key={id} id={id} /> : <p className="p-6 text-slate-500">No scheme chosen.</p>;
}

export default function EditSchemePage() {
  // The site is a static export, so the scheme id travels in the address (?id=DEL-001).
  return (
    <Suspense fallback={<p className="p-6 text-slate-500">Loading...</p>}>
      <Edit />
    </Suspense>
  );
}
