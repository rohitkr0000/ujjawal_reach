import type { RawRow } from '../src/types';

/**
 * The 15 Madhya Pradesh schemes from the old prototype, written in the Excel template format.
 * This is a STARTING POINT only: nothing here was checked against the official sources
 * (Phase 0 still needs a person to verify it). Rules the prototype wrote as "A or B" across
 * different fields cannot be expressed in the template; those are simplified or marked
 * "needs review" as noted in Source_Note.
 */
const NOTE = 'Prototype data, not yet verified against official sources.';

function row(r: Partial<Record<string, string | number>> & { id: string; name: string }): RawRow {
  return {
    Scheme_ID: r.id,
    State: 'Madhya Pradesh',
    'Scheme Name': r.name,
    'Category / Sector': r['sector'] ?? '',
    Level: r['level'] ?? 'State',
    Scope: r['scope'] ?? 'Individual',
    Gender_Focus: r['gender'] ?? 'All',
    Age_Min: r['ageMin'] ?? '',
    Age_Max: r['ageMax'] ?? '',
    Caste_Category: r['castes'] ?? '',
    Beneficiary_Type: r['beneficiaries'] ?? '',
    Income_Max: r['incomeMax'] ?? '',
    Education_Levels: r['education'] ?? '',
    Residence_Type: 'State resident',
    Application_Channel: r['channel'] ?? 'Online Portal',
    Application_URL: r['url'] ?? '',
    Description: r['desc'] ?? '',
    Description_Hindi: '',
    Status: 'active',
    Last_Verified_Date: '',
    Source_Note: r['note'] ? `${NOTE} ${r['note']}` : NOTE,
    Tags: '',
  };
}

const HS_UP = 'Higher Secondary, Graduate, Post Graduate';

export const MP_PROTOTYPE_ROWS: RawRow[] = [
  row({
    id: 'MP-001', name: 'Mukhyamantri Ladli Behna Yojana', sector: 'Women & Child Development',
    gender: 'Female', ageMin: 21, incomeMax: 250000, beneficiaries: 'Woman',
    url: 'https://cmladlibehna.mp.gov.in/',
    desc: 'Financial assistance of ₹1250/month for eligible women of Madhya Pradesh.',
  }),
  row({
    id: 'MP-002', name: 'Samagra Food Security Scheme - Subsidized Ration', sector: 'Food Security',
    scope: 'Family', incomeMax: 300000, beneficiaries: 'Household', url: 'https://samagra.gov.in/',
    channel: 'Department / Office',
    desc: 'Subsidized ration distribution across MP under Samagra portal guidelines.',
  }),
  row({
    id: 'MP-003', name: 'MP Jan Kalyan Sambal Yojana', sector: 'Labour & Social Security',
    beneficiaries: 'Worker', url: 'https://shramseva.mp.gov.in/',
    desc: "Social security assistance, educational support, and accident/death compensation for registered workers' families.",
    note: 'Needs review: the prototype rule was "worker OR income up to 2 lakh", which the template cannot express.',
  }),
  row({
    id: 'MP-004', name: 'Ayushman Bharat Niramaya MP / PM-JAY Health Insurance', sector: 'Health & Medical',
    level: 'State & Central', scope: 'Family', incomeMax: 300000, beneficiaries: 'Household',
    url: 'https://pmjay.gov.in/',
    desc: 'Cashless medical treatment up to ₹5 Lakh per family per year in empanelled hospitals.',
    note: 'Prototype also matched EWS families above 3 lakh; simplified to the income limit.',
  }),
  row({
    id: 'MP-005', name: 'Pradhan Mantri Awas Yojana - Urban & Rural (PMAY)', sector: 'Housing',
    level: 'State & Central', scope: 'Family', incomeMax: 300000, beneficiaries: 'Household',
    url: 'https://pmaymis.gov.in/',
    desc: 'Housing assistance and subsidies for constructing or purchasing pucca houses.',
    note: 'Prototype also matched EWS families above 3 lakh; simplified to the income limit.',
  }),
  row({
    id: 'MP-006', name: 'Ladli Laxmi Yojana 2.0', sector: 'Women & Child Development',
    gender: 'Female', ageMax: 18, beneficiaries: 'Woman', url: 'https://ladlilaxmi.mp.gov.in/',
    desc: 'Financial support and higher education incentives for girl child upbringing in MP.',
  }),
  row({
    id: 'MP-007', name: 'Gaon Ki Beti Yojana & Pratibha Kiran Scholarship', sector: 'Education & Scholarships',
    gender: 'Female', beneficiaries: 'Woman', education: HS_UP,
    url: 'http://scholarshipportal.mp.nic.in/',
    desc: 'Scholarships for meritorious girl students pursuing higher education.',
  }),
  row({
    id: 'MP-008', name: 'Mukhyamantri Seekho-Kamao Yojana (Earn While Learn)', sector: 'Labour & Livelihood',
    ageMin: 18, ageMax: 29, education: 'Higher Secondary, Graduate', url: 'https://mmsky.mp.gov.in/',
    desc: 'Skill training and stipend support for youth in industrial and commercial establishments.',
  }),
  row({
    id: 'MP-009', name: 'Mukhyamantri Udyam Kranti Yojana', sector: 'Business & MSME',
    ageMin: 18, ageMax: 40, education: 'Primary, Secondary, Higher Secondary, Graduate, Post Graduate',
    url: 'https://shramseva.mp.gov.in/',
    desc: 'Subsidized loans from ₹1 Lakh to ₹50 Lakh for youth to start manufacturing or business units in MP.',
  }),
  row({
    id: 'MP-010', name: 'Mukhyamantri Kisan Kalyan Yojana', sector: 'Agriculture & Farmer Welfare',
    beneficiaries: 'Farmer', url: 'https://mparpan.gov.in/',
    desc: 'Additional financial support of ₹6,000/year to farmers in MP (over and above PM-KISAN).',
  }),
  row({
    id: 'MP-011', name: 'MP Post Matric Scholarship for SC / ST / OBC Students', sector: 'Education & Scholarships',
    castes: 'SC, ST, OBC', education: HS_UP, url: 'http://www.tribal.mp.gov.in/MPTAAS',
    desc: 'Financial assistance and fee waivers for reserved category students.',
  }),
  row({
    id: 'MP-012', name: 'Mukhyamantri Teerth Darshan Yojana', sector: 'Senior Citizen Welfare',
    ageMin: 60, beneficiaries: 'Senior Citizen', url: 'http://religious.mp.gov.in/',
    channel: 'Department / Office',
    desc: 'Free pilgrimage travel for senior citizens of Madhya Pradesh to sacred places across India.',
  }),
  row({
    id: 'MP-013', name: 'Samagra Social Security Old Age & Widow Pension', sector: 'Senior Citizens & Social Assistance',
    beneficiaries: 'Senior Citizen, Unemployed', url: 'https://socialsecurity.mp.gov.in/',
    desc: 'Monthly pension support for senior citizens, widows, and destitute persons in MP.',
  }),
  row({
    id: 'MP-014', name: 'PM SVANidhi & Mudra Loan Scheme for MP Vendors', sector: 'Business & MSME',
    level: 'Central', beneficiaries: 'Entrepreneur, Vendor, Worker', url: 'https://pmswanidhi.mohua.gov.in/',
    desc: 'Collateral-free working capital loans and digital transaction incentives for street vendors and small shopkeepers.',
  }),
  row({
    id: 'MP-015', name: 'e-Shram Card Registration & Accidental Insurance Benefit', sector: 'Labour & Social Security',
    level: 'Central', beneficiaries: 'Worker, Farmer, Entrepreneur, Unemployed', url: 'https://eshram.gov.in/',
    desc: 'Accidental insurance coverage of ₹2 Lakh and social security registration for unorganized workers.',
  }),
];
