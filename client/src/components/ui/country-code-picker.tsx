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

const TIMEZONE_TO_DIAL_CODE: Record<string, string> = {
  'Africa/Abidjan': '+225', 'Africa/Accra': '+233', 'Africa/Addis_Ababa': '+251',
  'Africa/Algiers': '+213', 'Africa/Asmara': '+291', 'Africa/Bamako': '+223',
  'Africa/Bangui': '+236', 'Africa/Banjul': '+220', 'Africa/Bissau': '+245',
  'Africa/Blantyre': '+265', 'Africa/Brazzaville': '+242', 'Africa/Bujumbura': '+257',
  'Africa/Cairo': '+20', 'Africa/Casablanca': '+212', 'Africa/Ceuta': '+34',
  'Africa/Conakry': '+224', 'Africa/Dakar': '+221', 'Africa/Dar_es_Salaam': '+255',
  'Africa/Djibouti': '+253', 'Africa/Douala': '+237', 'Africa/El_Aaiun': '+212',
  'Africa/Freetown': '+232', 'Africa/Gaborone': '+267', 'Africa/Harare': '+263',
  'Africa/Johannesburg': '+27', 'Africa/Juba': '+211', 'Africa/Kampala': '+256',
  'Africa/Khartoum': '+249', 'Africa/Kigali': '+250', 'Africa/Kinshasa': '+243',
  'Africa/Lagos': '+234', 'Africa/Libreville': '+241', 'Africa/Lome': '+228',
  'Africa/Luanda': '+244', 'Africa/Lubumbashi': '+243', 'Africa/Lusaka': '+260',
  'Africa/Malabo': '+240', 'Africa/Maputo': '+258', 'Africa/Maseru': '+266',
  'Africa/Mbabane': '+268', 'Africa/Mogadishu': '+252', 'Africa/Monrovia': '+231',
  'Africa/Nairobi': '+254', 'Africa/Ndjamena': '+235', 'Africa/Niamey': '+227',
  'Africa/Nouakchott': '+222', 'Africa/Ouagadougou': '+226', 'Africa/Porto-Novo': '+229',
  'Africa/Sao_Tome': '+239', 'Africa/Tripoli': '+218', 'Africa/Tunis': '+216',
  'Africa/Windhoek': '+264',
  'America/Adak': '+1', 'America/Anchorage': '+1', 'America/Anguilla': '+1264',
  'America/Antigua': '+1268', 'America/Araguaina': '+55', 'America/Argentina/Buenos_Aires': '+54',
  'America/Argentina/Catamarca': '+54', 'America/Argentina/Cordoba': '+54',
  'America/Argentina/Jujuy': '+54', 'America/Argentina/La_Rioja': '+54',
  'America/Argentina/Mendoza': '+54', 'America/Argentina/Rio_Gallegos': '+54',
  'America/Argentina/Salta': '+54', 'America/Argentina/San_Juan': '+54',
  'America/Argentina/San_Luis': '+54', 'America/Argentina/Tucuman': '+54',
  'America/Argentina/Ushuaia': '+54', 'America/Aruba': '+297', 'America/Asuncion': '+595',
  'America/Atikokan': '+1', 'America/Bahia': '+55', 'America/Bahia_Banderas': '+52',
  'America/Barbados': '+1246', 'America/Belem': '+55', 'America/Belize': '+501',
  'America/Blanc-Sablon': '+1', 'America/Boa_Vista': '+55', 'America/Bogota': '+57',
  'America/Boise': '+1', 'America/Cambridge_Bay': '+1', 'America/Campo_Grande': '+55',
  'America/Cancun': '+52', 'America/Caracas': '+58', 'America/Cayenne': '+594',
  'America/Cayman': '+1345', 'America/Chicago': '+1', 'America/Chihuahua': '+52',
  'America/Costa_Rica': '+506', 'America/Creston': '+1', 'America/Cuiaba': '+55',
  'America/Curacao': '+599', 'America/Danmarkshavn': '+299', 'America/Dawson': '+1',
  'America/Dawson_Creek': '+1', 'America/Denver': '+1', 'America/Detroit': '+1',
  'America/Dominica': '+1767', 'America/Edmonton': '+1', 'America/Eirunepe': '+55',
  'America/El_Salvador': '+503', 'America/Fortaleza': '+55', 'America/Glace_Bay': '+1',
  'America/Godthab': '+299', 'America/Goose_Bay': '+1', 'America/Grand_Turk': '+1649',
  'America/Grenada': '+1473', 'America/Guadeloupe': '+590', 'America/Guatemala': '+502',
  'America/Guayaquil': '+593', 'America/Guyana': '+592', 'America/Halifax': '+1',
  'America/Havana': '+53', 'America/Hermosillo': '+52', 'America/Indiana/Indianapolis': '+1',
  'America/Indiana/Knox': '+1', 'America/Indiana/Marengo': '+1', 'America/Indiana/Petersburg': '+1',
  'America/Indiana/Tell_City': '+1', 'America/Indiana/Vevay': '+1', 'America/Indiana/Vincennes': '+1',
  'America/Indiana/Winamac': '+1', 'America/Inuvik': '+1', 'America/Iqaluit': '+1',
  'America/Jamaica': '+1876', 'America/Juneau': '+1', 'America/Kentucky/Louisville': '+1',
  'America/Kentucky/Monticello': '+1', 'America/Kralendijk': '+599', 'America/La_Paz': '+591',
  'America/Lima': '+51', 'America/Los_Angeles': '+1', 'America/Lower_Princes': '+1721',
  'America/Maceio': '+55', 'America/Managua': '+505', 'America/Manaus': '+55',
  'America/Marigot': '+590', 'America/Martinique': '+596', 'America/Matamoros': '+52',
  'America/Mazatlan': '+52', 'America/Menominee': '+1', 'America/Merida': '+52',
  'America/Metlakatla': '+1', 'America/Mexico_City': '+52', 'America/Miquelon': '+508',
  'America/Moncton': '+1', 'America/Monterrey': '+52', 'America/Montevideo': '+598',
  'America/Montserrat': '+1664', 'America/Nassau': '+1242', 'America/New_York': '+1',
  'America/Nipigon': '+1', 'America/Nome': '+1', 'America/Noronha': '+55',
  'America/North_Dakota/Beulah': '+1', 'America/North_Dakota/Center': '+1',
  'America/North_Dakota/New_Salem': '+1', 'America/Nuuk': '+299', 'America/Ojinaga': '+52',
  'America/Panama': '+507', 'America/Pangnirtung': '+1', 'America/Paramaribo': '+597',
  'America/Phoenix': '+1', 'America/Port-au-Prince': '+509', 'America/Port_of_Spain': '+1868',
  'America/Porto_Velho': '+55', 'America/Puerto_Rico': '+1', 'America/Punta_Arenas': '+56',
  'America/Rainy_River': '+1', 'America/Rankin_Inlet': '+1', 'America/Recife': '+55',
  'America/Regina': '+1', 'America/Resolute': '+1', 'America/Rio_Branco': '+55',
  'America/Santarem': '+55', 'America/Santiago': '+56', 'America/Santo_Domingo': '+1809',
  'America/Sao_Paulo': '+55', 'America/Scoresbysund': '+299', 'America/Sitka': '+1',
  'America/St_Barthelemy': '+590', 'America/St_Johns': '+1', 'America/St_Kitts': '+1869',
  'America/St_Lucia': '+1758', 'America/St_Thomas': '+1340', 'America/St_Vincent': '+1784',
  'America/Swift_Current': '+1', 'America/Tegucigalpa': '+504', 'America/Thule': '+299',
  'America/Thunder_Bay': '+1', 'America/Tijuana': '+52', 'America/Toronto': '+1',
  'America/Tortola': '+1284', 'America/Vancouver': '+1', 'America/Whitehorse': '+1',
  'America/Winnipeg': '+1', 'America/Yakutat': '+1', 'America/Yellowknife': '+1',
  'Antarctica/Casey': '+61', 'Antarctica/Davis': '+7', 'Antarctica/DumontDUrville': '+33',
  'Antarctica/Macquarie': '+61', 'Antarctica/Mawson': '+91', 'Antarctica/McMurdo': '+64',
  'Antarctica/Palmer': '+56', 'Antarctica/Rothera': '+44', 'Antarctica/Syowa': '+81',
  'Antarctica/Troll': '+47', 'Antarctica/Vostok': '+7',
  'Asia/Aden': '+967', 'Asia/Almaty': '+7', 'Asia/Amman': '+962', 'Asia/Anadyr': '+7',
  'Asia/Aqtau': '+7', 'Asia/Aqtobe': '+7', 'Asia/Ashgabat': '+993', 'Asia/Atyrau': '+7',
  'Asia/Baghdad': '+964', 'Asia/Bahrain': '+973', 'Asia/Baku': '+994', 'Asia/Bangkok': '+66',
  'Asia/Barnaul': '+7', 'Asia/Beirut': '+961', 'Asia/Bishkek': '+996', 'Asia/Brunei': '+673',
  'Asia/Chita': '+7', 'Asia/Choibalsan': '+976', 'Asia/Colombo': '+94', 'Asia/Damascus': '+963',
  'Asia/Dhaka': '+880', 'Asia/Dili': '+670', 'Asia/Dubai': '+971', 'Asia/Dushanbe': '+992',
  'Asia/Famagusta': '+357', 'Asia/Gaza': '+970', 'Asia/Hebron': '+970', 'Asia/Ho_Chi_Minh': '+84',
  'Asia/Hong_Kong': '+852', 'Asia/Hovd': '+976', 'Asia/Irkutsk': '+7', 'Asia/Jakarta': '+62',
  'Asia/Jayapura': '+62', 'Asia/Jerusalem': '+972', 'Asia/Kabul': '+93', 'Asia/Kamchatka': '+7',
  'Asia/Karachi': '+92', 'Asia/Kathmandu': '+977', 'Asia/Khandyga': '+7', 'Asia/Kolkata': '+91',
  'Asia/Krasnoyarsk': '+7', 'Asia/Kuala_Lumpur': '+60', 'Asia/Kuching': '+60',
  'Asia/Kuwait': '+965', 'Asia/Macau': '+853', 'Asia/Magadan': '+7', 'Asia/Makassar': '+62',
  'Asia/Manila': '+63', 'Asia/Muscat': '+968', 'Asia/Nicosia': '+357', 'Asia/Novokuznetsk': '+7',
  'Asia/Novosibirsk': '+7', 'Asia/Omsk': '+7', 'Asia/Oral': '+7', 'Asia/Phnom_Penh': '+855',
  'Asia/Pontianak': '+62', 'Asia/Pyongyang': '+850', 'Asia/Qatar': '+974',
  'Asia/Qostanay': '+7', 'Asia/Qyzylorda': '+7', 'Asia/Riyadh': '+966', 'Asia/Sakhalin': '+7',
  'Asia/Samarkand': '+998', 'Asia/Seoul': '+82', 'Asia/Shanghai': '+86', 'Asia/Singapore': '+65',
  'Asia/Srednekolymsk': '+7', 'Asia/Taipei': '+886', 'Asia/Tashkent': '+998',
  'Asia/Tbilisi': '+995', 'Asia/Tehran': '+98', 'Asia/Thimphu': '+975', 'Asia/Tokyo': '+81',
  'Asia/Tomsk': '+7', 'Asia/Ulaanbaatar': '+976', 'Asia/Urumqi': '+86', 'Asia/Ust-Nera': '+7',
  'Asia/Vientiane': '+856', 'Asia/Vladivostok': '+7', 'Asia/Yakutsk': '+7',
  'Asia/Yangon': '+95', 'Asia/Yekaterinburg': '+7', 'Asia/Yerevan': '+374',
  'Atlantic/Azores': '+351', 'Atlantic/Bermuda': '+1441', 'Atlantic/Canary': '+34',
  'Atlantic/Cape_Verde': '+238', 'Atlantic/Faroe': '+298', 'Atlantic/Madeira': '+351',
  'Atlantic/Reykjavik': '+354', 'Atlantic/South_Georgia': '+500', 'Atlantic/St_Helena': '+290',
  'Atlantic/Stanley': '+500',
  'Australia/Adelaide': '+61', 'Australia/Brisbane': '+61', 'Australia/Broken_Hill': '+61',
  'Australia/Currie': '+61', 'Australia/Darwin': '+61', 'Australia/Eucla': '+61',
  'Australia/Hobart': '+61', 'Australia/Lindeman': '+61', 'Australia/Lord_Howe': '+61',
  'Australia/Melbourne': '+61', 'Australia/Perth': '+61', 'Australia/Sydney': '+61',
  'Europe/Amsterdam': '+31', 'Europe/Andorra': '+376', 'Europe/Astrakhan': '+7',
  'Europe/Athens': '+30', 'Europe/Belgrade': '+381', 'Europe/Berlin': '+49',
  'Europe/Bratislava': '+421', 'Europe/Brussels': '+32', 'Europe/Bucharest': '+40',
  'Europe/Budapest': '+36', 'Europe/Busingen': '+49', 'Europe/Chisinau': '+373',
  'Europe/Copenhagen': '+45', 'Europe/Dublin': '+353', 'Europe/Gibraltar': '+350',
  'Europe/Guernsey': '+44', 'Europe/Helsinki': '+358', 'Europe/Isle_of_Man': '+44',
  'Europe/Istanbul': '+90', 'Europe/Jersey': '+44', 'Europe/Kaliningrad': '+7',
  'Europe/Kiev': '+380', 'Europe/Kirov': '+7', 'Europe/Lisbon': '+351',
  'Europe/Ljubljana': '+386', 'Europe/London': '+44', 'Europe/Luxembourg': '+352',
  'Europe/Madrid': '+34', 'Europe/Malta': '+356', 'Europe/Mariehamn': '+358',
  'Europe/Minsk': '+375', 'Europe/Monaco': '+377', 'Europe/Moscow': '+7',
  'Europe/Nicosia': '+357', 'Europe/Oslo': '+47', 'Europe/Paris': '+33',
  'Europe/Podgorica': '+382', 'Europe/Prague': '+420', 'Europe/Riga': '+371',
  'Europe/Rome': '+39', 'Europe/Samara': '+7', 'Europe/San_Marino': '+378',
  'Europe/Sarajevo': '+387', 'Europe/Saratov': '+7', 'Europe/Simferopol': '+380',
  'Europe/Skopje': '+389', 'Europe/Sofia': '+359', 'Europe/Stockholm': '+46',
  'Europe/Tallinn': '+372', 'Europe/Tirane': '+355', 'Europe/Ulyanovsk': '+7',
  'Europe/Uzhgorod': '+380', 'Europe/Vaduz': '+423', 'Europe/Vatican': '+39',
  'Europe/Vienna': '+43', 'Europe/Vilnius': '+370', 'Europe/Volgograd': '+7',
  'Europe/Warsaw': '+48', 'Europe/Zagreb': '+385', 'Europe/Zaporozhye': '+380',
  'Europe/Zurich': '+41',
  'Indian/Antananarivo': '+261', 'Indian/Chagos': '+246', 'Indian/Christmas': '+61',
  'Indian/Cocos': '+61', 'Indian/Comoro': '+269', 'Indian/Kerguelen': '+262',
  'Indian/Mahe': '+248', 'Indian/Maldives': '+960', 'Indian/Mauritius': '+230',
  'Indian/Mayotte': '+262', 'Indian/Reunion': '+262',
  'Pacific/Apia': '+685', 'Pacific/Auckland': '+64', 'Pacific/Bougainville': '+675',
  'Pacific/Chatham': '+64', 'Pacific/Chuuk': '+691', 'Pacific/Easter': '+56',
  'Pacific/Efate': '+678', 'Pacific/Enderbury': '+686', 'Pacific/Fakaofo': '+690',
  'Pacific/Fiji': '+679', 'Pacific/Funafuti': '+688', 'Pacific/Galapagos': '+593',
  'Pacific/Gambier': '+689', 'Pacific/Guadalcanal': '+677', 'Pacific/Guam': '+1671',
  'Pacific/Honolulu': '+1', 'Pacific/Kiritimati': '+686', 'Pacific/Kosrae': '+691',
  'Pacific/Kwajalein': '+692', 'Pacific/Majuro': '+692', 'Pacific/Marquesas': '+689',
  'Pacific/Midway': '+1', 'Pacific/Nauru': '+674', 'Pacific/Niue': '+683',
  'Pacific/Norfolk': '+672', 'Pacific/Noumea': '+687', 'Pacific/Pago_Pago': '+1684',
  'Pacific/Palau': '+680', 'Pacific/Pitcairn': '+870', 'Pacific/Pohnpei': '+691',
  'Pacific/Port_Moresby': '+675', 'Pacific/Rarotonga': '+682', 'Pacific/Saipan': '+1670',
  'Pacific/Tahiti': '+689', 'Pacific/Tarawa': '+686', 'Pacific/Tongatapu': '+676',
  'Pacific/Wake': '+1', 'Pacific/Wallis': '+681',
};

export function detectCountryDialCode(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      const dialCode = TIMEZONE_TO_DIAL_CODE[tz];
      if (dialCode && ALL_COUNTRIES.some(c => c.dialCode === dialCode)) {
        return dialCode;
      }
    }
  } catch {
  }
  return '+44';
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
