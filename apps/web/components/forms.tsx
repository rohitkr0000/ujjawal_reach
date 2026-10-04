'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Plus, ShieldCheck, UserPlus } from 'lucide-react';
import {
  EDUCATION_LEVELS,
  INCOME_BRACKETS,
  OCCUPATIONS,
  SPECIAL_GROUPS,
  STATE_DISTRICTS,
} from '@ujjwal/schemes';
import { useLang } from '../lib/i18n';
import {
  emptyFamilyRoot,
  emptyMember,
  emptyPersonal,
  formatAddress,
  hasErrors,
  memberToPerson,
  personalToPerson,
  validateFamilyRoot,
  validateMember,
  validatePersonal,
  type Errors,
  type FamilyRootValues,
  type MemberValues,
  type Person,
  type PersonalValues,
} from '../lib/forms';
import { CheckField, SelectField, SpecialGroups, TextField } from './ui';

export interface SubmitData {
  mode: 'personal' | 'family';
  state: string;
  district: string;
  addressText: string;
  address: { house: string; locality: string; pincode: string };
  family: { income: number; category: string; minority: boolean; residence: number } | null;
  people: Person[];
  consentTracking: boolean;
}

const CATEGORIES = ['SC', 'ST', 'OBC', 'EWS', 'General'];
const RELATIONS = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Other'];

function useOptions() {
  const { lang, opt } = useLang();
  return {
    income: INCOME_BRACKETS.map((b) => ({
      value: String(b.value),
      label: lang === 'hi' ? b.labelHi : b.label,
    })),
    category: CATEGORIES.map((c) => ({ value: c, label: opt('cat', c) })),
    education: EDUCATION_LEVELS.map((c) => ({ value: c, label: opt('edu', c) })),
    occupation: OCCUPATIONS.map((c) => ({ value: c, label: opt('occ', c) })),
    relation: RELATIONS.map((c) => ({ value: c, label: opt('rel', c) })),
  };
}

function FormHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  const { t } = useLang();
  return (
    <div className="mb-6 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <button type="button" onClick={onBack} className="btn-secondary shrink-0">
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">{t('changeMode')}</span>
      </button>
    </div>
  );
}

function AddressBlock({
  state,
  values,
  set,
  errors,
}: {
  state: string;
  values: { house: string; locality: string; district: string; pincode: string };
  set: (patch: Partial<{ house: string; locality: string; district: string; pincode: string }>) => void;
  errors: Errors;
}) {
  const { t } = useLang();
  const districts = (STATE_DISTRICTS[state] ?? []).map((d) => ({ value: d, label: d }));
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
      <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-900">
        <MapPin className="h-4 w-4" /> {t('addressTitle')}
      </h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <TextField label={t('house')} name="house" value={values.house} onChange={(v) => set({ house: v })} errors={errors} />
        <TextField label={t('locality')} name="locality" value={values.locality} onChange={(v) => set({ locality: v })} errors={errors} />
        <SelectField label={t('district')} name="district" value={values.district} onChange={(v) => set({ district: v })} errors={errors} options={districts} />
        <div>
          <label className="label">{t('state')}</label>
          <input className="field bg-slate-100 font-bold text-blue-900" value={state} disabled readOnly />
        </div>
        <TextField
          label={t('pincode')}
          name="pincode"
          value={values.pincode}
          onChange={(v) => set({ pincode: v.replace(/\D/g, '').slice(0, 6) })}
          errors={errors}
          inputMode="numeric"
          placeholder={t('pincodePh')}
          className="md:col-span-2"
        />
      </div>
    </div>
  );
}

function Consents({
  detailsChecked,
  trackingChecked,
  onDetails,
  onTracking,
  error,
}: {
  detailsChecked: boolean;
  trackingChecked: boolean;
  onDetails: (v: boolean) => void;
  onTracking: (v: boolean) => void;
  error?: string;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <CheckField checked={detailsChecked} onChange={onDetails} error={error}>
        {t('consentDetails')}{' '}
        <Link href="/privacy" target="_blank" className="font-semibold text-blue-900 underline">
          {t('privacyLink')}
        </Link>
      </CheckField>
      <CheckField checked={trackingChecked} onChange={onTracking}>
        {t('consentTracking')}
      </CheckField>
    </div>
  );
}

export function PersonalForm({
  state,
  onSubmit,
  onBack,
  onStart,
  onStep,
}: {
  state: string;
  onSubmit: (d: SubmitData) => void;
  onBack: () => void;
  onStart: () => void;
  onStep: (step: string) => void;
}) {
  const { t } = useLang();
  const options = useOptions();
  const [v, setV] = useState<PersonalValues>(emptyPersonal);
  const [errors, setErrors] = useState<Errors>({});
  const set = (patch: Partial<PersonalValues>) => setV((p) => ({ ...p, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validatePersonal(v);
    setErrors(errs);
    if (hasErrors(errs)) {
      const first = Object.keys(errs)[0]!;
      document.getElementById(`f_${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onStep('details');
    onStep('address');
    onSubmit({
      mode: 'personal',
      state,
      district: v.district,
      addressText: formatAddress(v, state),
      address: { house: v.house.trim(), locality: v.locality.trim(), pincode: v.pincode.trim() },
      family: null,
      people: [personalToPerson(v, state)],
      consentTracking: v.consentTracking,
    });
  };

  return (
    <div className="card">
      <FormHeader title={t('personalFormTitle', { state })} subtitle={t('personalFormSub')} onBack={onBack} />
      <form onSubmit={submit} noValidate className="space-y-6" onFocusCapture={onStart}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField label={`${t('fullName')} *`} name="name" value={v.name} onChange={(x) => set({ name: x })} errors={errors} />
          <TextField label={`${t('mobile')} *`} name="mobile" value={v.mobile} onChange={(x) => set({ mobile: x.replace(/\D/g, '').slice(0, 10) })} errors={errors} type="tel" inputMode="numeric" placeholder={t('mobilePh')} />
          <TextField label={`1. ${t('age')} *`} name="age" value={v.age} onChange={(x) => set({ age: x.replace(/\D/g, '').slice(0, 3) })} errors={errors} inputMode="numeric" />
          <SelectField label={`2. ${t('income')} *`} name="income" value={v.income} onChange={(x) => set({ income: x })} errors={errors} options={options.income} />
          <SelectField label={`3. ${t('category')} *`} name="category" value={v.category} onChange={(x) => set({ category: x })} errors={errors} options={options.category} />
          <SelectField label={`4. ${t('education')} *`} name="education" value={v.education} onChange={(x) => set({ education: x })} errors={errors} options={options.education} />
          <SelectField label={`5. ${t('occupation')} *`} name="occupation" value={v.occupation} onChange={(x) => set({ occupation: x })} errors={errors} options={options.occupation} />
          <SelectField
            label={`6. ${t('gender')} *`}
            name="gender"
            value={v.gender}
            onChange={(x) => set({ gender: x })}
            errors={errors}
            options={[
              { value: 'Male', label: t('male') },
              { value: 'Female', label: t('female') },
            ]}
          />
          <TextField label={`7. ${t('residence')} *`} name="residence" value={v.residence} onChange={(x) => set({ residence: x.replace(/\D/g, '').slice(0, 3) })} errors={errors} inputMode="numeric" />
        </div>
        <CheckField checked={v.minority} onChange={(c) => set({ minority: c })}>
          {t('minority')}
        </CheckField>
        <SpecialGroups value={v.special} onChange={(s) => set({ special: s })} groups={SPECIAL_GROUPS} />
        <AddressBlock state={state} values={v} set={set} errors={errors} />
        <Consents
          detailsChecked={v.consentDetails}
          trackingChecked={v.consentTracking}
          onDetails={(c) => set({ consentDetails: c })}
          onTracking={(c) => set({ consentTracking: c })}
          error={errors['consentDetails'] ? t(errors['consentDetails']) : undefined}
        />
        <button type="submit" className="btn-primary w-full">
          {t('checkSchemes')} <ShieldCheck className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export function FamilyForm({
  state,
  onSubmit,
  onBack,
  onStart,
  onStep,
}: {
  state: string;
  onSubmit: (d: SubmitData) => void;
  onBack: () => void;
  onStart: () => void;
  onStep: (step: string) => void;
}) {
  const { t, opt } = useLang();
  const options = useOptions();
  const [root, setRoot] = useState<FamilyRootValues>(emptyFamilyRoot);
  const [rootErrors, setRootErrors] = useState<Errors>({});
  const [member, setMember] = useState<MemberValues>(emptyMember);
  const [memberErrors, setMemberErrors] = useState<Errors>({});
  const [members, setMembers] = useState<MemberValues[]>([]);
  const [editIndex, setEditIndex] = useState(-1);
  const [membersError, setMembersError] = useState('');
  const setR = (patch: Partial<FamilyRootValues>) => setRoot((p) => ({ ...p, ...patch }));
  const setM = (patch: Partial<MemberValues>) => setMember((p) => ({ ...p, ...patch }));

  const saveMember = () => {
    const errs = validateMember(member);
    setMemberErrors(errs);
    if (hasErrors(errs)) {
      setMembersError('');
      return;
    }
    if (editIndex === -1) setMembers((m) => [...m, member]);
    else setMembers((m) => m.map((x, i) => (i === editIndex ? member : x)));
    onStep('member_saved');
    setMember(emptyMember());
    setEditIndex(-1);
    setMembersError('');
  };

  const startEdit = (i: number) => {
    setMember(members[i]!);
    setEditIndex(i);
    setMemberErrors({});
    document.getElementById('f_name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cancelEdit = () => {
    setMember(emptyMember());
    setEditIndex(-1);
    setMemberErrors({});
  };

  const remove = (i: number) => {
    setMembers((m) => m.filter((_, x) => x !== i));
    if (editIndex === i) cancelEdit();
    else if (editIndex > i) setEditIndex(editIndex - 1);
  };

  const submit = () => {
    const errs = validateFamilyRoot(root);
    setRootErrors(errs);
    if (hasErrors(errs)) {
      document.getElementById(`f_${Object.keys(errs)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (members.length === 0) {
      setMembersError(t('errMembers'));
      return;
    }
    onStep('family_details');
    onSubmit({
      mode: 'family',
      state,
      district: root.district,
      addressText: formatAddress(root, state),
      address: { house: root.house.trim(), locality: root.locality.trim(), pincode: root.pincode.trim() },
      family: {
        income: Number(root.income),
        category: root.category,
        minority: root.minority,
        residence: Number(root.residence),
      },
      people: members.map((m) => memberToPerson(m, root, state)),
      consentTracking: root.consentTracking,
    });
  };

  return (
    <div className="card" onFocusCapture={onStart}>
      <FormHeader title={t('familyFormTitle', { state })} subtitle={t('familyFormSub')} onBack={onBack} />

      <div className="mb-6 space-y-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
        <div className="flex items-center justify-between border-b border-blue-200 pb-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-blue-900">{t('familyRootTitle')}</h3>
          <span className="rounded-full bg-blue-200 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">{t('sameForAll')}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SelectField label={`2. ${t('income')} *`} name="income" value={root.income} onChange={(x) => setR({ income: x })} errors={rootErrors} options={options.income} />
          <SelectField label={`3. ${t('category')} *`} name="category" value={root.category} onChange={(x) => setR({ category: x })} errors={rootErrors} options={options.category} />
          <TextField label={`7. ${t('residence')} *`} name="residence" value={root.residence} onChange={(x) => setR({ residence: x.replace(/\D/g, '').slice(0, 3) })} errors={rootErrors} inputMode="numeric" />
        </div>
        <CheckField checked={root.minority} onChange={(c) => setR({ minority: c })}>
          {t('minority')}
        </CheckField>
        <AddressBlock state={state} values={root} set={setR} errors={rootErrors} />
      </div>

      <div className="mb-6 space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
        <h3 className="flex items-center gap-2 border-b border-emerald-200 pb-3 text-sm font-extrabold uppercase tracking-wider text-emerald-900">
          <UserPlus className="h-4 w-4" /> {editIndex === -1 ? t('membersTitle') : t('editMemberTitle')}
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <TextField label={`${t('fullName')} *`} name="name" value={member.name} onChange={(x) => setM({ name: x })} errors={memberErrors} />
          <TextField label={`${t('mobile')} *`} name="mobile" value={member.mobile} onChange={(x) => setM({ mobile: x.replace(/\D/g, '').slice(0, 10) })} errors={memberErrors} type="tel" inputMode="numeric" placeholder={t('mobilePh')} />
          <SelectField label={t('relation')} name="relation" value={member.relation} onChange={(x) => setM({ relation: x || 'Self' })} errors={memberErrors} options={options.relation} />
          <SelectField
            label={`${t('gender')} *`}
            name="gender"
            value={member.gender}
            onChange={(x) => setM({ gender: x })}
            errors={memberErrors}
            options={[
              { value: 'Male', label: t('male') },
              { value: 'Female', label: t('female') },
            ]}
          />
          <TextField label={`${t('age')} *`} name="age" value={member.age} onChange={(x) => setM({ age: x.replace(/\D/g, '').slice(0, 3) })} errors={memberErrors} inputMode="numeric" />
          <SelectField label={`${t('education')} *`} name="education" value={member.education} onChange={(x) => setM({ education: x })} errors={memberErrors} options={options.education} />
          <SelectField label={`${t('occupation')} *`} name="occupation" value={member.occupation} onChange={(x) => setM({ occupation: x })} errors={memberErrors} options={options.occupation} />
        </div>
        <SpecialGroups value={member.special} onChange={(s) => setM({ special: s })} groups={SPECIAL_GROUPS} />
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={saveMember} className="btn-secondary bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> {editIndex === -1 ? t('addMember') : t('updateMember')}
          </button>
          {editIndex !== -1 && (
            <button type="button" onClick={cancelEdit} className="btn-secondary">
              {t('cancel')}
            </button>
          )}
        </div>
      </div>

      {members.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-3 text-sm font-bold text-slate-700">{t('addedMembers')} ({members.length})</h4>
          <ul className="space-y-2">
            {members.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3.5 text-sm shadow-sm">
                <span>
                  <b>{m.name}</b> ({opt('rel', m.relation)}) · {m.mobile} · {m.age} · {opt('occ', m.occupation)}
                </span>
                <span className="space-x-3">
                  <button type="button" onClick={() => startEdit(i)} className="font-semibold text-blue-600 hover:underline">
                    {t('edit')}
                  </button>
                  <button type="button" onClick={() => remove(i)} className="font-semibold text-red-500 hover:underline">
                    {t('remove')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {membersError && (
        <p role="alert" className="mb-4 text-sm font-medium text-red-600">
          {membersError}
        </p>
      )}

      <Consents
        detailsChecked={root.consentDetails}
        trackingChecked={root.consentTracking}
        onDetails={(c) => setR({ consentDetails: c })}
        onTracking={(c) => setR({ consentTracking: c })}
        error={rootErrors['consentDetails'] ? t(rootErrors['consentDetails']) : undefined}
      />
      <button type="button" onClick={submit} className="btn-primary mt-6 w-full">
        {t('lockCheck')} <ShieldCheck className="h-4 w-4" />
      </button>
    </div>
  );
}
