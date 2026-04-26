import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search } from "lucide-react";

export interface CountryEntry {
  flag: string;
  name: string;
  dialCode: string;
}

const PINNED_CODES = ['+44', '+353', '+1'];

export const ALL_COUNTRIES: CountryEntry[] = [
  { flag: '🇬🇧', name: 'United Kingdom', dialCode: '+44' },
  { flag: '🇮🇪', name: 'Ireland', dialCode: '+353' },
  { flag: '🇺🇸', name: 'United States', dialCode: '+1' },
  { flag: '🇦🇫', name: 'Afghanistan', dialCode: '+93' },
  { flag: '🇦🇱', name: 'Albania', dialCode: '+355' },
  { flag: '🇩🇿', name: 'Algeria', dialCode: '+213' },
  { flag: '🇦🇩', name: 'Andorra', dialCode: '+376' },
  { flag: '🇦🇴', name: 'Angola', dialCode: '+244' },
  { flag: '🇦🇬', name: 'Antigua & Barbuda', dialCode: '+1268' },
  { flag: '🇦🇷', name: 'Argentina', dialCode: '+54' },
  { flag: '🇦🇲', name: 'Armenia', dialCode: '+374' },
  { flag: '🇦🇺', name: 'Australia', dialCode: '+61' },
  { flag: '🇦🇹', name: 'Austria', dialCode: '+43' },
  { flag: '🇦🇿', name: 'Azerbaijan', dialCode: '+994' },
  { flag: '🇧🇸', name: 'Bahamas', dialCode: '+1242' },
  { flag: '🇧🇭', name: 'Bahrain', dialCode: '+973' },
  { flag: '🇧🇩', name: 'Bangladesh', dialCode: '+880' },
  { flag: '🇧🇧', name: 'Barbados', dialCode: '+1246' },
  { flag: '🇧🇾', name: 'Belarus', dialCode: '+375' },
  { flag: '🇧🇪', name: 'Belgium', dialCode: '+32' },
  { flag: '🇧🇿', name: 'Belize', dialCode: '+501' },
  { flag: '🇧🇯', name: 'Benin', dialCode: '+229' },
  { flag: '🇧🇹', name: 'Bhutan', dialCode: '+975' },
  { flag: '🇧🇴', name: 'Bolivia', dialCode: '+591' },
  { flag: '🇧🇦', name: 'Bosnia & Herzegovina', dialCode: '+387' },
  { flag: '🇧🇼', name: 'Botswana', dialCode: '+267' },
  { flag: '🇧🇷', name: 'Brazil', dialCode: '+55' },
  { flag: '🇧🇳', name: 'Brunei', dialCode: '+673' },
  { flag: '🇧🇬', name: 'Bulgaria', dialCode: '+359' },
  { flag: '🇧🇫', name: 'Burkina Faso', dialCode: '+226' },
  { flag: '🇧🇮', name: 'Burundi', dialCode: '+257' },
  { flag: '🇨🇻', name: 'Cabo Verde', dialCode: '+238' },
  { flag: '🇰🇭', name: 'Cambodia', dialCode: '+855' },
  { flag: '🇨🇲', name: 'Cameroon', dialCode: '+237' },
  { flag: '🇨🇦', name: 'Canada', dialCode: '+1' },
  { flag: '🇨🇫', name: 'Central African Republic', dialCode: '+236' },
  { flag: '🇹🇩', name: 'Chad', dialCode: '+235' },
  { flag: '🇨🇱', name: 'Chile', dialCode: '+56' },
  { flag: '🇨🇳', name: 'China', dialCode: '+86' },
  { flag: '🇨🇴', name: 'Colombia', dialCode: '+57' },
  { flag: '🇰🇲', name: 'Comoros', dialCode: '+269' },
  { flag: '🇨🇬', name: 'Congo', dialCode: '+242' },
  { flag: '🇨🇩', name: 'Congo (DR)', dialCode: '+243' },
  { flag: '🇨🇷', name: 'Costa Rica', dialCode: '+506' },
  { flag: '🇭🇷', name: 'Croatia', dialCode: '+385' },
  { flag: '🇨🇺', name: 'Cuba', dialCode: '+53' },
  { flag: '🇨🇾', name: 'Cyprus', dialCode: '+357' },
  { flag: '🇨🇿', name: 'Czech Republic', dialCode: '+420' },
  { flag: '🇩🇰', name: 'Denmark', dialCode: '+45' },
  { flag: '🇩🇯', name: 'Djibouti', dialCode: '+253' },
  { flag: '🇩🇲', name: 'Dominica', dialCode: '+1767' },
  { flag: '🇩🇴', name: 'Dominican Republic', dialCode: '+1809' },
  { flag: '🇪🇨', name: 'Ecuador', dialCode: '+593' },
  { flag: '🇪🇬', name: 'Egypt', dialCode: '+20' },
  { flag: '🇸🇻', name: 'El Salvador', dialCode: '+503' },
  { flag: '🇬🇶', name: 'Equatorial Guinea', dialCode: '+240' },
  { flag: '🇪🇷', name: 'Eritrea', dialCode: '+291' },
  { flag: '🇪🇪', name: 'Estonia', dialCode: '+372' },
  { flag: '🇸🇿', name: 'Eswatini', dialCode: '+268' },
  { flag: '🇪🇹', name: 'Ethiopia', dialCode: '+251' },
  { flag: '🇫🇯', name: 'Fiji', dialCode: '+679' },
  { flag: '🇫🇮', name: 'Finland', dialCode: '+358' },
  { flag: '🇫🇷', name: 'France', dialCode: '+33' },
  { flag: '🇬🇦', name: 'Gabon', dialCode: '+241' },
  { flag: '🇬🇲', name: 'Gambia', dialCode: '+220' },
  { flag: '🇬🇪', name: 'Georgia', dialCode: '+995' },
  { flag: '🇩🇪', name: 'Germany', dialCode: '+49' },
  { flag: '🇬🇭', name: 'Ghana', dialCode: '+233' },
  { flag: '🇬🇷', name: 'Greece', dialCode: '+30' },
  { flag: '🇬🇩', name: 'Grenada', dialCode: '+1473' },
  { flag: '🇬🇹', name: 'Guatemala', dialCode: '+502' },
  { flag: '🇬🇳', name: 'Guinea', dialCode: '+224' },
  { flag: '🇬🇼', name: 'Guinea-Bissau', dialCode: '+245' },
  { flag: '🇬🇾', name: 'Guyana', dialCode: '+592' },
  { flag: '🇭🇹', name: 'Haiti', dialCode: '+509' },
  { flag: '🇭🇳', name: 'Honduras', dialCode: '+504' },
  { flag: '🇭🇺', name: 'Hungary', dialCode: '+36' },
  { flag: '🇮🇸', name: 'Iceland', dialCode: '+354' },
  { flag: '🇮🇳', name: 'India', dialCode: '+91' },
  { flag: '🇮🇩', name: 'Indonesia', dialCode: '+62' },
  { flag: '🇮🇷', name: 'Iran', dialCode: '+98' },
  { flag: '🇮🇶', name: 'Iraq', dialCode: '+964' },
  { flag: '🇮🇱', name: 'Israel', dialCode: '+972' },
  { flag: '🇮🇹', name: 'Italy', dialCode: '+39' },
  { flag: '🇯🇲', name: 'Jamaica', dialCode: '+1876' },
  { flag: '🇯🇵', name: 'Japan', dialCode: '+81' },
  { flag: '🇯🇴', name: 'Jordan', dialCode: '+962' },
  { flag: '🇰🇿', name: 'Kazakhstan', dialCode: '+7' },
  { flag: '🇰🇪', name: 'Kenya', dialCode: '+254' },
  { flag: '🇰🇮', name: 'Kiribati', dialCode: '+686' },
  { flag: '🇽🇰', name: 'Kosovo', dialCode: '+383' },
  { flag: '🇰🇼', name: 'Kuwait', dialCode: '+965' },
  { flag: '🇰🇬', name: 'Kyrgyzstan', dialCode: '+996' },
  { flag: '🇱🇦', name: 'Laos', dialCode: '+856' },
  { flag: '🇱🇻', name: 'Latvia', dialCode: '+371' },
  { flag: '🇱🇧', name: 'Lebanon', dialCode: '+961' },
  { flag: '🇱🇸', name: 'Lesotho', dialCode: '+266' },
  { flag: '🇱🇷', name: 'Liberia', dialCode: '+231' },
  { flag: '🇱🇾', name: 'Libya', dialCode: '+218' },
  { flag: '🇱🇮', name: 'Liechtenstein', dialCode: '+423' },
  { flag: '🇱🇹', name: 'Lithuania', dialCode: '+370' },
  { flag: '🇱🇺', name: 'Luxembourg', dialCode: '+352' },
  { flag: '🇲🇬', name: 'Madagascar', dialCode: '+261' },
  { flag: '🇲🇼', name: 'Malawi', dialCode: '+265' },
  { flag: '🇲🇾', name: 'Malaysia', dialCode: '+60' },
  { flag: '🇲🇻', name: 'Maldives', dialCode: '+960' },
  { flag: '🇲🇱', name: 'Mali', dialCode: '+223' },
  { flag: '🇲🇹', name: 'Malta', dialCode: '+356' },
  { flag: '🇲🇭', name: 'Marshall Islands', dialCode: '+692' },
  { flag: '🇲🇷', name: 'Mauritania', dialCode: '+222' },
  { flag: '🇲🇺', name: 'Mauritius', dialCode: '+230' },
  { flag: '🇲🇽', name: 'Mexico', dialCode: '+52' },
  { flag: '🇫🇲', name: 'Micronesia', dialCode: '+691' },
  { flag: '🇲🇩', name: 'Moldova', dialCode: '+373' },
  { flag: '🇲🇨', name: 'Monaco', dialCode: '+377' },
  { flag: '🇲🇳', name: 'Mongolia', dialCode: '+976' },
  { flag: '🇲🇪', name: 'Montenegro', dialCode: '+382' },
  { flag: '🇲🇦', name: 'Morocco', dialCode: '+212' },
  { flag: '🇲🇿', name: 'Mozambique', dialCode: '+258' },
  { flag: '🇲🇲', name: 'Myanmar', dialCode: '+95' },
  { flag: '🇳🇦', name: 'Namibia', dialCode: '+264' },
  { flag: '🇳🇷', name: 'Nauru', dialCode: '+674' },
  { flag: '🇳🇵', name: 'Nepal', dialCode: '+977' },
  { flag: '🇳🇱', name: 'Netherlands', dialCode: '+31' },
  { flag: '🇳🇿', name: 'New Zealand', dialCode: '+64' },
  { flag: '🇳🇮', name: 'Nicaragua', dialCode: '+505' },
  { flag: '🇳🇪', name: 'Niger', dialCode: '+227' },
  { flag: '🇳🇬', name: 'Nigeria', dialCode: '+234' },
  { flag: '🇲🇰', name: 'North Macedonia', dialCode: '+389' },
  { flag: '🇳🇴', name: 'Norway', dialCode: '+47' },
  { flag: '🇴🇲', name: 'Oman', dialCode: '+968' },
  { flag: '🇵🇰', name: 'Pakistan', dialCode: '+92' },
  { flag: '🇵🇼', name: 'Palau', dialCode: '+680' },
  { flag: '🇵🇦', name: 'Panama', dialCode: '+507' },
  { flag: '🇵🇬', name: 'Papua New Guinea', dialCode: '+675' },
  { flag: '🇵🇾', name: 'Paraguay', dialCode: '+595' },
  { flag: '🇵🇪', name: 'Peru', dialCode: '+51' },
  { flag: '🇵🇭', name: 'Philippines', dialCode: '+63' },
  { flag: '🇵🇱', name: 'Poland', dialCode: '+48' },
  { flag: '🇵🇹', name: 'Portugal', dialCode: '+351' },
  { flag: '🇶🇦', name: 'Qatar', dialCode: '+974' },
  { flag: '🇷🇴', name: 'Romania', dialCode: '+40' },
  { flag: '🇷🇺', name: 'Russia', dialCode: '+7' },
  { flag: '🇷🇼', name: 'Rwanda', dialCode: '+250' },
  { flag: '🇰🇳', name: 'Saint Kitts & Nevis', dialCode: '+1869' },
  { flag: '🇱🇨', name: 'Saint Lucia', dialCode: '+1758' },
  { flag: '🇻🇨', name: 'Saint Vincent', dialCode: '+1784' },
  { flag: '🇼🇸', name: 'Samoa', dialCode: '+685' },
  { flag: '🇸🇲', name: 'San Marino', dialCode: '+378' },
  { flag: '🇸🇹', name: 'São Tomé & Príncipe', dialCode: '+239' },
  { flag: '🇸🇦', name: 'Saudi Arabia', dialCode: '+966' },
  { flag: '🇸🇳', name: 'Senegal', dialCode: '+221' },
  { flag: '🇷🇸', name: 'Serbia', dialCode: '+381' },
  { flag: '🇸🇨', name: 'Seychelles', dialCode: '+248' },
  { flag: '🇸🇱', name: 'Sierra Leone', dialCode: '+232' },
  { flag: '🇸🇬', name: 'Singapore', dialCode: '+65' },
  { flag: '🇸🇰', name: 'Slovakia', dialCode: '+421' },
  { flag: '🇸🇮', name: 'Slovenia', dialCode: '+386' },
  { flag: '🇸🇧', name: 'Solomon Islands', dialCode: '+677' },
  { flag: '🇸🇴', name: 'Somalia', dialCode: '+252' },
  { flag: '🇿🇦', name: 'South Africa', dialCode: '+27' },
  { flag: '🇸🇸', name: 'South Sudan', dialCode: '+211' },
  { flag: '🇪🇸', name: 'Spain', dialCode: '+34' },
  { flag: '🇱🇰', name: 'Sri Lanka', dialCode: '+94' },
  { flag: '🇸🇩', name: 'Sudan', dialCode: '+249' },
  { flag: '🇸🇷', name: 'Suriname', dialCode: '+597' },
  { flag: '🇸🇪', name: 'Sweden', dialCode: '+46' },
  { flag: '🇨🇭', name: 'Switzerland', dialCode: '+41' },
  { flag: '🇸🇾', name: 'Syria', dialCode: '+963' },
  { flag: '🇹🇼', name: 'Taiwan', dialCode: '+886' },
  { flag: '🇹🇯', name: 'Tajikistan', dialCode: '+992' },
  { flag: '🇹🇿', name: 'Tanzania', dialCode: '+255' },
  { flag: '🇹🇭', name: 'Thailand', dialCode: '+66' },
  { flag: '🇹🇱', name: 'Timor-Leste', dialCode: '+670' },
  { flag: '🇹🇬', name: 'Togo', dialCode: '+228' },
  { flag: '🇹🇴', name: 'Tonga', dialCode: '+676' },
  { flag: '🇹🇹', name: 'Trinidad & Tobago', dialCode: '+1868' },
  { flag: '🇹🇳', name: 'Tunisia', dialCode: '+216' },
  { flag: '🇹🇷', name: 'Turkey', dialCode: '+90' },
  { flag: '🇹🇲', name: 'Turkmenistan', dialCode: '+993' },
  { flag: '🇹🇻', name: 'Tuvalu', dialCode: '+688' },
  { flag: '🇺🇬', name: 'Uganda', dialCode: '+256' },
  { flag: '🇺🇦', name: 'Ukraine', dialCode: '+380' },
  { flag: '🇦🇪', name: 'United Arab Emirates', dialCode: '+971' },
  { flag: '🇺🇾', name: 'Uruguay', dialCode: '+598' },
  { flag: '🇺🇿', name: 'Uzbekistan', dialCode: '+998' },
  { flag: '🇻🇺', name: 'Vanuatu', dialCode: '+678' },
  { flag: '🇻🇦', name: 'Vatican City', dialCode: '+39' },
  { flag: '🇻🇪', name: 'Venezuela', dialCode: '+58' },
  { flag: '🇻🇳', name: 'Vietnam', dialCode: '+84' },
  { flag: '🇾🇪', name: 'Yemen', dialCode: '+967' },
  { flag: '🇿🇲', name: 'Zambia', dialCode: '+260' },
  { flag: '🇿🇼', name: 'Zimbabwe', dialCode: '+263' },
];

const PINNED_COUNTRIES = ALL_COUNTRIES.filter(c => PINNED_CODES.includes(c.dialCode));
const REST_COUNTRIES = ALL_COUNTRIES.filter(c => !PINNED_CODES.includes(c.dialCode));

export function getCountryByDialCode(dialCode: string): CountryEntry | undefined {
  return ALL_COUNTRIES.find(c => c.dialCode === dialCode);
}

interface CountryCodePickerProps {
  value: string;
  onChange: (dialCode: string) => void;
  disabled?: boolean;
}

export function CountryCodePicker({ value, onChange, disabled }: CountryCodePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = getCountryByDialCode(value);

  const query = search.toLowerCase();
  const filtered: (CountryEntry | { flag: string; name: string; dialCode: '__sep__' })[] = query
    ? ALL_COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(query) || c.dialCode.includes(query)
      )
    : [
        ...PINNED_COUNTRIES,
        { flag: '', name: 'All countries', dialCode: '__sep__' as const },
        ...REST_COUNTRIES,
      ];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className="flex items-center gap-1 h-12 px-2 border border-gray-300 rounded-l-md bg-white hover:bg-gray-50 focus:outline-none focus:border-green-600 disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px] max-w-[90px]"
        aria-label="Select country code"
      >
        <span className="text-lg leading-none">{selected?.flag ?? '🌐'}</span>
        <span className="text-sm font-medium text-gray-800 truncate">{value}</span>
        <ChevronDown className="h-3 w-3 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
              <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search country…"
                className="flex-1 bg-transparent text-sm outline-none text-gray-800 placeholder-gray-400 min-w-0"
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map((c, i) => {
              if (c.dialCode === '__sep__') {
                return (
                  <li key="sep" className="px-3 py-1 text-xs text-gray-400 select-none border-t border-gray-100 mt-1 pt-2">
                    All countries
                  </li>
                );
              }
              const isActive = c.dialCode === value;
              return (
                <li key={`${c.dialCode}-${i}`}>
                  <button
                    type="button"
                    onClick={() => { onChange(c.dialCode); setOpen(false); setSearch(''); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-green-50 hover:text-green-800 transition-colors ${isActive ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-700'}`}
                  >
                    <span className="text-base leading-none w-5 text-center flex-shrink-0">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{c.dialCode}</span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-sm text-gray-400 text-center">No countries found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
