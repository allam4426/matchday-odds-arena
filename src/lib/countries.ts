/** ISO 3166-1 alpha-2 codes used for residency and jurisdiction checks. */
export const COUNTRIES: { code: string; name: string }[] = [
  ["AE", "United Arab Emirates"], ["AR", "Argentina"], ["AT", "Austria"], ["AU", "Australia"], ["BD", "Bangladesh"],
  ["BE", "Belgium"], ["BG", "Bulgaria"], ["BH", "Bahrain"], ["BN", "Brunei"], ["BR", "Brazil"], ["CA", "Canada"],
  ["CH", "Switzerland"], ["CL", "Chile"], ["CM", "Cameroon"], ["CN", "China"], ["CO", "Colombia"], ["CY", "Cyprus"],
  ["CZ", "Czechia"], ["DE", "Germany"], ["DK", "Denmark"], ["EG", "Egypt"], ["ES", "Spain"], ["ET", "Ethiopia"],
  ["FI", "Finland"], ["FR", "France"], ["GB", "United Kingdom"], ["GH", "Ghana"], ["GR", "Greece"], ["HK", "Hong Kong"],
  ["HR", "Croatia"], ["HU", "Hungary"], ["ID", "Indonesia"], ["IE", "Ireland"], ["IL", "Israel"], ["IN", "India"],
  ["IQ", "Iraq"], ["IT", "Italy"], ["JO", "Jordan"], ["JP", "Japan"], ["KE", "Kenya"], ["KH", "Cambodia"],
  ["KR", "South Korea"], ["KW", "Kuwait"], ["LB", "Lebanon"], ["LK", "Sri Lanka"], ["MA", "Morocco"], ["MT", "Malta"],
  ["MV", "Maldives"], ["MX", "Mexico"], ["MY", "Malaysia"], ["NG", "Nigeria"], ["NL", "Netherlands"], ["NO", "Norway"],
  ["NP", "Nepal"], ["NZ", "New Zealand"], ["OM", "Oman"], ["PE", "Peru"], ["PH", "Philippines"], ["PK", "Pakistan"],
  ["PL", "Poland"], ["PT", "Portugal"], ["QA", "Qatar"], ["RO", "Romania"], ["RS", "Serbia"], ["SA", "Saudi Arabia"],
  ["SE", "Sweden"], ["SG", "Singapore"], ["SK", "Slovakia"], ["SN", "Senegal"], ["TH", "Thailand"], ["TN", "Tunisia"],
  ["TR", "Türkiye"], ["TW", "Taiwan"], ["TZ", "Tanzania"], ["UA", "Ukraine"], ["UG", "Uganda"], ["US", "United States"],
  ["UY", "Uruguay"], ["VN", "Vietnam"], ["ZA", "South Africa"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"],
].map(([code, name]) => ({ code, name }));

export function countryName(code: string | null | undefined) {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code ?? "";
}
