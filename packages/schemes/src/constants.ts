export const STATES = ['Delhi', 'Madhya Pradesh'] as const;
export const LEVELS = ['State', 'Central', 'State & Central'] as const;
export const GENDER_FOCUS = ['All', 'Female', 'Male'] as const;
export const SCOPES = ['Individual', 'Family'] as const;
export const CASTES = ['SC', 'ST', 'OBC', 'EWS', 'Minority', 'General'] as const;
export const BENEFICIARIES = [
  'Student',
  'Farmer',
  'Worker',
  'Senior Citizen',
  'Woman',
  'Child',
  'Person with Disability',
  'Entrepreneur',
  'Vendor',
  'Artisan',
  'Patient',
  'Household',
  'Homeless / Urban Poor',
  'Unemployed',
  'General Public',
] as const;
export const EDUCATION_LEVELS = [
  'None',
  'Primary',
  'Secondary',
  'Higher Secondary',
  'Graduate',
  'Post Graduate',
] as const;
export const RESIDENCE_TYPES = ['State resident', 'Pan-India', 'Any'] as const;
export const CHANNELS = [
  'e-District',
  'Online Portal',
  'Bank',
  'Hospital / Health Centre',
  'School / College',
  'Helpline',
  'Department / Office',
  'Other',
] as const;
export const STATUSES = ['active', 'inactive'] as const;

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * Income brackets shown in the forms. The value is the LOWER bound of the bracket, so a person
 * who may be under a limit still sees the scheme (the results page carries a disclaimer).
 */
export const INCOME_BRACKETS = [
  { value: 0, label: 'Below ₹1 Lakh', labelHi: '₹1 लाख से कम' },
  { value: 100000, label: '₹1 - 2 Lakh', labelHi: '₹1 - 2 लाख' },
  { value: 200000, label: '₹2 - 2.5 Lakh', labelHi: '₹2 - 2.5 लाख' },
  { value: 250000, label: '₹2.5 - 3 Lakh', labelHi: '₹2.5 - 3 लाख' },
  { value: 300001, label: 'Above ₹3 Lakh', labelHi: '₹3 लाख से अधिक' },
] as const;

export const OCCUPATIONS = [
  'Student',
  'Worker',
  'Daily Wages',
  'Farmer',
  'Business',
  'Salaried',
  'Unemployed',
] as const;

/** Extra groups a person can tick; they cannot be worked out from the other answers. */
export const SPECIAL_GROUPS = [
  'Person with Disability',
  'Patient',
  'Artisan',
  'Homeless / Urban Poor',
] as const;

export const STATE_DISTRICTS: Record<string, string[]> = {
  Delhi: [
    'Central Delhi',
    'New Delhi',
    'North Delhi',
    'South Delhi',
    'East Delhi',
    'West Delhi',
    'North-East Delhi',
    'North-West Delhi',
    'South-East Delhi',
    'South-West Delhi',
    'Shahdara',
  ],
  'Madhya Pradesh': [
    'Agar Malwa', 'Alirajpur', 'Anuppur', 'Ashoknagar', 'Balaghat', 'Barwani', 'Betul', 'Bhind',
    'Bhopal', 'Burhanpur', 'Chhatarpur', 'Chhindwara', 'Damoh', 'Datia', 'Dewas', 'Dhar',
    'Dindori', 'Guna', 'Gwalior', 'Harda', 'Hoshangabad (Narmadapuram)', 'Indore', 'Jabalpur',
    'Jhabua', 'Katni', 'Khandwa', 'Khargone', 'Mandla', 'Mandsaur', 'Morena', 'Narsinghpur',
    'Neemuch', 'Niwari', 'Panna', 'Raisen', 'Rajgarh', 'Ratlam', 'Rewa', 'Sagar', 'Satna',
    'Sehore', 'Seoni', 'Shajapur', 'Sheopur', 'Shivpuri', 'Sidhi', 'Singrauli', 'Tikamgarh',
    'Ujjain', 'Umaria', 'Vidisha',
  ],
};

/**
 * Everything the website needs to know about a state, besides its districts (STATE_DISTRICTS above)
 * and its schemes (an Excel upload). To open a new state add it to STATES, STATE_META and
 * STATE_DISTRICTS: nothing else in the code changes (see docs/ADDING_A_STATE.md).
 */
export const STATE_META: Record<(typeof STATES)[number], { code: string; slug: string; hindi: string }> = {
  Delhi: { code: 'DL', slug: 'delhi', hindi: 'दिल्ली' },
  'Madhya Pradesh': { code: 'MP', slug: 'madhyapradesh', hindi: 'मध्य प्रदेश' },
};

/** Short URL-safe code for each state, used in tags and in the public JSON file names. */
export const STATE_SLUGS: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_META).map(([name, m]) => [name, m.slug]),
);

/** States that are announced but not open yet. Shown locked on the home page. */
export const COMING_SOON_STATES = [
  { name: 'Uttar Pradesh', code: 'UP' },
  { name: 'Uttarakhand', code: 'UK' },
  { name: 'Punjab', code: 'PB' },
] as const;
