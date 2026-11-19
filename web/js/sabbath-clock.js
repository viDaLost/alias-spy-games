/*! Sunset calculations adapted from SunCalc (Meeus solar coordinates), BSD-2-Clause.
 * https://github.com/mourner/suncalc — license below.
 * Copyright (c) 2026, Volodymyr Agafonkin
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, are
 * permitted provided that the following conditions are met:
 * 
 *    1. Redistributions of source code must retain the above copyright notice, this list of
 *       conditions and the following disclaimer.
 * 
 *    2. Redistributions in binary form must reproduce the above copyright notice, this list
 *       of conditions and the following disclaimer in the documentation and/or other materials
 *       provided with the distribution.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 */
(function (root) {
'use strict';
// shortcuts for easier to read formulas
const {PI, sin, cos, tan, asin, atan2: atan, acos, sqrt, abs, round, floor} = Math;
const rad = PI / 180;

// date/time constants and conversions

const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const earthRadius = 6378.14; // equatorial radius in km, for the Moon's topocentric parallax

function fromJulian(j) {
    return new Date((j + 0.5 - J1970) * dayMs);
}
function toDays(date) {
    return date.valueOf() / dayMs - 0.5 + J1970 - J2000;
}

// ΔT = TT − UT in seconds (Espenak & Meeus polynomial fits, good ~1900–2150). The Meeus position
// series are defined in Terrestrial Time, but SunCalc's input Dates are UT — so the position math
// runs on days-since-J2000 shifted by deltaT, while sidereal time stays on UT. ~69 s today;
// negligible for the Sun (<0.001°), real for the Moon. d only needs ~month accuracy here (ΔT
// changes <1 s/yr), so the decimal year is derived arithmetically from d rather than from the Date.
function deltaT(d) {
    const y = 2000 + d / 365.2425;
    let t;
    if (y < 1920) { t = y - 1900; return -2.79 + t * (1.494119 + t * (-0.0598939 + t * (0.0061966 - t * 0.000197))); }
    if (y < 1941) { t = y - 1920; return 21.20 + t * (0.84493 + t * (-0.076100 + t * 0.0020936)); }
    if (y < 1961) { t = y - 1950; return 29.07 + t * (0.407 + t * (-1 / 233 + t / 2547)); }
    if (y < 1986) { t = y - 1975; return 45.45 + t * (1.067 + t * (-1 / 260 - t / 718)); }
    if (y < 2005) { t = y - 2000; return 63.86 + t * (0.3345 + t * (-0.060374 + t * (0.0017275 + t * (0.000651814 + t * 0.00002373599)))); }
    if (y < 2050) { t = y - 2000; return 62.92 + t * (0.32217 + t * 0.005589); }
    t = (y - 1820) / 100; return -20 + 32 * t * t - 0.5628 * (2150 - y);
}
function toDaysTT(d) {
    return d + deltaT(d) / 86400;
}

// general calculations for position

// north-based clockwise azimuth in degrees (0 = N, 90 = E, 180 = S, 270 = W)
function azimuth(H, phi, dec) {
    return (atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)) / rad + 540) % 360;
}
function altitude(H, phi, dec) {
    return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
}

// Greenwich mean sidereal time, formula 12.4 of Meeus (linear term; sub-arcsec T^2/T^3 dropped)
function siderealTime(d, lw) {
    return rad * (280.46061837 + 360.98564736629 * d) - lw;
}

function astroRefraction(h) {
    if (h < 0) h = 0; // formula valid for positive altitudes only

    // Meeus 16.4: 1.02 / tan(h + 10.26 / (h + 5.10)), h in degrees, arcmin result — folded into rad
    return 0.0002967 / tan(h + 0.00312536 / (h + 0.08901179));
}

// general sun calculations

// Sun's apparent equatorial coordinates, Meeus ch. 25. d = days since J2000 (TT); t = Julian centuries.
function sunCoords(d) {
    const t = d / 36525;
    const L0 = rad * (280.46646 + t * (36000.76983 + t * 0.0003032)); // 25.2 geometric mean longitude
    const M = rad * (357.52911 + t * (35999.05029 - t * 0.0001537)); // 25.3 mean anomaly
    const sinM = sin(M);
    const cosM = cos(M);
    const C = rad * ((1.914602 - t * (0.004817 + t * 0.000014)) * sinM + // equation of center
        (0.019993 - 0.000101 * t) * 2 * sinM * cosM + 0.000289 * sinM * (3 - 4 * sinM * sinM));
    const Om = rad * (125.04 - 1934.136 * t); // longitude of the ascending node
    const L = L0 + C - rad * (0.00569 + 0.00478 * sin(Om)); // apparent longitude (nutation + aberration)
    // 22.2 mean obliquity + 25.8 correction for apparent position
    const e = rad * (23.439291 - t * (0.0130042 + t * (0.00000016 - t * 0.000000504))) + rad * 0.00256 * cos(Om);

    return {
        ra: atan(cos(e) * sin(L), cos(L)), // 25.6
        dec: asin(sin(e) * sin(L)),        // 25.7
        lon: L
    };
}


const J0 = 0.0009;

function observerAngle(height) {
    return -2.076 * sqrt(height) / 60;
}

// wrap an angle to (-PI, PI]
function wrapPi(a) {
    return a - 2 * PI * round(a / (2 * PI));
}

// refines a transit time so the Sun's local hour angle is zero (Meeus 15.2; dH/dd ~= 2*PI/day,
// the sidereal excess and the Sun's own motion cancelling to one solar day).
function solarTransit(dt, lw) {
    for (let i = 0; i < 3; i++) {
        const H = wrapPi(siderealTime(dt, lw) - sunCoords(toDaysTT(dt)).ra);
        dt -= H / (2 * PI);
    }
    return dt;
}

// time the Sun reaches altitude h0 on the given side of transit (sign -1 = rise, +1 = set);
// starts from the hour angle at transit and converges with Meeus' altitude correction (15.2).
function getSetJ(h0, dt, sign, lw, phi, decT) {
    const cosH0 = (sin(h0) - sin(phi) * sin(decT)) / (cos(phi) * cos(decT));
    if (cosH0 < -1 || cosH0 > 1) return NaN; // sun stays above / below this altitude all day

    let d = dt + sign * acos(cosH0) / (2 * PI);
    for (let i = 0; i < 2; i++) {
        const c = sunCoords(toDaysTT(d));
        const H = wrapPi(siderealTime(d, lw) - c.ra);
        const h = altitude(H, phi, c.dec);
        const sinH = cos(phi) * cos(c.dec) * sin(H);
        if (abs(sinH) < 1e-6) break; // grazing the horizon — correction is ill-conditioned
        d += (h - h0) / (2 * PI * sinH);
    }
    return d;
}

// start of the civil day containing date in a zone utcOffset minutes ahead of UTC, as a ms timestamp
function civilMidnight(date, utcOffset) {
    const offMs = utcOffset * 60000;
    return floor((date.valueOf() + offMs) / dayMs) * dayMs - offMs;
}

// solar transit (days since J2000) anchoring the day shared by getTimes and getMoonTimes: the one
// nearest the instant (the solar day containing it), or nearest civil noon when an offset is given
function solarDayTransit(date, lw, utcOffset) {
    const anchor = utcOffset === undefined ? date.valueOf() : civilMidnight(date, utcOffset) + dayMs / 2;
    const lon = J0 + lw / (2 * PI);
    return solarTransit(round(toDays(anchor) - lon) + lon, lw);
}


const GAME_IDS = Object.freeze(['moses-nile', 'biblical-match-three', 'kids-ark-pairs', 'twelve-tribes', 'promised-land']);
function validCoordinates(place) {
  return !!place && typeof place.latitude === 'number' && Number.isFinite(place.latitude)
    && Math.abs(place.latitude) <= 90 && typeof place.longitude === 'number'
    && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180;
}
const formatters = new Map();
function civilParts(date, timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',
    {timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(date)
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return parts;
}
function localHour(calendarDay, hour, timeZone) {
  const target = calendarDay + hour * 3600000;
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const p = civilParts(new Date(instant), timeZone);
    const observed = Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    const next = target - (observed - instant);
    if (next === instant) break;
    instant = next;
  }
  return instant;
}
function validCity(value) {
  if (!validCoordinates(value) || typeof value.name !== 'string' || !value.name.trim()
    || value.name.length > 150 || typeof value.timeZone !== 'string' || value.timeZone.length > 80) return false;
  try { civilParts(new Date(0), value.timeZone); return true; } catch { return false; }
}
const CITIES = Object.freeze([
  Object.freeze({name:'Москва',country:'RU',latitude:55.7558,longitude:37.6173,timeZone:'Europe/Moscow'}),
  Object.freeze({name:'Берлин',country:'DE',latitude:52.5244,longitude:13.4105,timeZone:'Europe/Berlin'}),
  Object.freeze({name:'Киев',country:'UA',latitude:50.4547,longitude:30.5238,timeZone:'Europe/Kiev'}),
]);
// Generated from the GeoNames catalog, sorted by population within each time zone.
const ZONE_CITIES = {"Asia/Shanghai":["Shanghai","CN",31.22222,121.45806],"Africa/Kinshasa":["Kinshasa","CD",-4.32758,15.31357],"Europe/Istanbul":["Istanbul","TR",41.01384,28.94966],"Africa/Lagos":["Lagos","NG",6.45407,3.39467],"Asia/Ho_Chi_Minh":["Ho Chi Minh City","VN",10.82302,106.62965],"Asia/Karachi":["Lahore","PK",31.558,74.35071],"Asia/Kolkata":["Mumbai","IN",19.07283,72.88261],"America/Sao_Paulo":["São Paulo","BR",-23.5475,-46.63611],"America/Mexico_City":["Mexico City","MX",19.42847,-99.12766],"Europe/Moscow":["Маскав","RU",55.75204,37.61781],"Asia/Dhaka":["Dhaka","BD",23.7104,90.40744],"Asia/Seoul":["Seoul","KR",37.566,126.9784],"Asia/Tokyo":["Tokyo","JP",35.6895,139.69171],"Africa/Cairo":["Cairo","EG",30.06263,31.24967],"Africa/Johannesburg":["Johannesburg","ZA",-26.20227,28.04363],"Europe/London":["London","GB",51.50853,-0.12574],"America/New_York":["New York City","US",40.71427,-74.00597],"Asia/Jakarta":["Jakarta","ID",-6.21462,106.84513],"Asia/Bangkok":["Hanoi","VN",21.0245,105.84117],"Asia/Taipei":["Taipei","TW",25.05306,121.52639],"America/Lima":["Lima","PE",-12.04318,-77.02824],"America/Bogota":["Bogotá","CO",4.60971,-74.08175],"Asia/Hong_Kong":["Hong Kong","HK",22.27832,114.17469],"Asia/Baghdad":["Baghdad","IQ",33.34058,44.40088],"Asia/Tehran":["Tehran","IR",35.69439,51.42151],"Africa/Abidjan":["Abidjan","CI",5.35444,-4.00167],"Australia/Sydney":["Sydney","AU",-33.86785,151.20732],"Asia/Singapore":["Singapore","SG",1.28967,103.85007],"Australia/Melbourne":["Melbourne","AU",-37.814,144.96332],"Africa/Dar_es_Salaam":["Dar es Salaam","TZ",-6.82349,39.26951],"America/Santiago":["Santiago","CL",-33.45694,-70.64827],"Asia/Riyadh":["Jeddah","SA",21.49012,39.18624],"Asia/Yangon":["Yangon","MM",16.80528,96.15611],"Asia/Kabul":["Kabul","AF",34.52813,69.17233],"Africa/Nairobi":["Nairobi","KE",-1.28333,36.81667],"Africa/Bamako":["Bamako","ML",12.60915,-7.97522],"Asia/Urumqi":["Ürümqi","CN",43.80096,87.60046],"Africa/Addis_Ababa":["Addis Ababa","ET",9.02497,38.74689],"America/Los_Angeles":["Los Angeles","US",34.05223,-118.24368],"Asia/Dubai":["Dubai","AE",25.07725,55.30927],"Africa/Casablanca":["Casablanca","MA",33.58831,-7.61138],"Europe/Berlin":["Berlin","DE",52.52437,13.41053],"Europe/Madrid":["Madrid","ES",40.4165,-3.70256],"Asia/Pyongyang":["Pyongyang","KP",39.03385,125.75432],"Asia/Manila":["Quezon City","PH",14.6488,121.0509],"America/Caracas":["Caracas","VE",10.48801,-66.87919],"Europe/Kyiv":["Киев","UA",50.45466,30.5238],"America/Argentina/Buenos_Aires":["Buenos Aires","AR",-34.61315,-58.37723],"America/Toronto":["Toronto","CA",43.70643,-79.39864],"America/Guayaquil":["Quito","EC",-0.22985,-78.52495],"Australia/Brisbane":["Brisbane","AU",-27.46794,153.02809],"Africa/Luanda":["Luanda","AO",-8.83682,13.23432],"America/Bahia":["Salvador","BR",-12.97563,-38.49096],"America/Chicago":["Chicago","US",41.85003,-87.65005],"Africa/Dakar":["Dakar","SN",14.6937,-17.44406],"Africa/Mogadishu":["Mogadishu","SO",2.03711,45.34375],"Africa/Accra":["Kumasi","GH",6.68848,-1.62443],"Africa/Ouagadougou":["Ouagadougou","BF",12.36566,-1.53388],"America/Fortaleza":["Fortaleza","BR",-3.71722,-38.54306],"Australia/Perth":["Perth","AU",-31.95224,115.8614],"Africa/Algiers":["Algiers","DZ",36.73225,3.08746],"Asia/Baku":["Baku","AZ",40.37767,49.89201],"Europe/Rome":["Rome","IT",41.89193,12.51133],"Africa/Lubumbashi":["Lubumbashi","CD",-11.66089,27.47938],"America/Manaus":["Manaus","BR",-3.10194,-60.025],"Africa/Lusaka":["Lusaka","ZM",-15.40669,28.28713],"America/Santo_Domingo":["Santo Domingo","DO",18.47186,-69.89232],"Africa/Lome":["Lomé","TG",6.12874,1.22154],"America/Havana":["Havana","CU",23.13302,-82.38304],"Europe/Paris":["Paris","FR",48.85341,2.3488],"America/Argentina/Cordoba":["Córdoba","AR",-31.40648,-64.18853],"Asia/Damascus":["Aleppo","SY",36.20124,37.16117],"America/La_Paz":["La Paz","BO",-16.5,-68.15],"Africa/Brazzaville":["Brazzaville","CG",-4.26613,15.28318],"Asia/Tashkent":["Tashkent","UZ",41.26465,69.21627],"Asia/Almaty":["Almaty","KZ",43.25249,76.9115],"Africa/Khartoum":["Khartoum","SD",15.55177,32.53241],"Asia/Aden":["Sanaa","YE",15.35452,44.20646],"Africa/Conakry":["Conakry","GN",9.53795,-13.67729],"America/Tijuana":["Tijuana","MX",32.5027,-117.00371],"Asia/Beirut":["Beirut","LB",33.89332,35.50157],"Europe/Bucharest":["Bucharest","RO",44.43225,26.10626],"Europe/Minsk":["Минск","BY",53.90019,27.56653],"Europe/Budapest":["Budapest","HU",47.49835,19.04045],"Europe/Warsaw":["Warsaw","PL",52.22977,21.01178],"Europe/Vienna":["Vienna","AT",48.20849,16.37208],"Africa/Kampala":["Kampala","UG",0.31628,32.58219],"America/Recife":["Recife","BR",-8.05389,-34.88111],"America/Phoenix":["Phoenix","US",33.44838,-112.07404],"Asia/Novosibirsk":["Виль Сибиркар","RU",55.02259,82.93175],"Asia/Phnom_Penh":["Phnom Penh","KH",11.56245,104.91601],"Pacific/Auckland":["Auckland","NZ",-36.84853,174.76349],"Africa/Harare":["Harare","ZW",-17.82772,31.05337],"Africa/Monrovia":["Monrovia","LR",6.30054,-10.7969],"Europe/Stockholm":["Stockholm","SE",59.32938,18.06871],"America/Ciudad_Juarez":["Ciudad Juárez","MX",31.72024,-106.46084],"America/Belem":["Belém","BR",-1.45583,-48.50444],"Asia/Yekaterinburg":["Екатеринбург","RU",56.85733,60.61529],"America/Asuncion":["Asunción","PY",-25.28646,-57.647],"Asia/Makassar":["Makassar","ID",-5.14861,119.43194],"Australia/Adelaide":["Adelaide","AU",-34.92866,138.59863],"Asia/Kuala_Lumpur":["Kuala Lumpur","MY",3.1412,101.68653],"Asia/Kathmandu":["Kathmandu","NP",27.70169,85.3206],"Africa/Ndjamena":["N'Djamena","TD",12.10672,15.0444],"Indian/Antananarivo":["Antananarivo","MG",-18.91368,47.53613],"Africa/Douala":["Douala","CM",4.04827,9.70428],"Africa/Niamey":["Niamey","NE",13.51366,2.1098],"America/Edmonton":["Calgary","CA",51.05011,-114.08529],"Africa/Tripoli":["Tripoli","LY",32.88743,13.18733],"Asia/Amman":["Amman","JO",31.95522,35.94503],"Europe/Belgrade":["Belgrade","RS",44.80401,20.46513],"America/Montevideo":["Montevideo","UY",-34.90328,-56.18816],"Africa/Maputo":["Maputo","MZ",-25.96553,32.58322],"America/Port-au-Prince":["Port-au-Prince","HT",18.54349,-72.33881],"America/Merida":["Mérida","MX",20.967,-89.62318],"Africa/Nouakchott":["Nouakchott","MR",18.08581,-15.9785],"Asia/Omsk":["Омбы","RU",54.99244,73.36859],"Europe/Prague":["Prague","CZ",50.08804,14.42076],"Europe/Samara":["Куйбышев","RU",53.20767,50.13553],"Europe/Copenhagen":["Copenhagen","DK",55.67594,12.56553],"Europe/Sofia":["Sofia","BG",42.69751,23.32415],"Asia/Yerevan":["Yerevan","AM",40.17765,44.5126],"America/Monterrey":["Monterrey","MX",25.68435,-100.31721],"Africa/Kigali":["Kigali","RW",-1.94995,30.05885],"Africa/Blantyre":["Lilongwe","MW",-13.96692,33.78725],"Asia/Krasnoyarsk":["Краснодор","RU",56.03742,92.93136],"Europe/Oslo":["Oslo","NO",59.91273,10.74609],"Asia/Tbilisi":["Tbilisi","GE",41.69143,44.83412],"America/Maceio":["Maceió","BR",-9.66583,-35.73528],"Asia/Ashgabat":["Ashgabat","TM",37.95,58.38333],"Europe/Dublin":["Dublin","IE",53.33306,-6.24889],"Europe/Brussels":["Brussels","BE",50.85045,4.34878],"Europe/Volgograd":["Валгаград","RU",48.71378,44.4976],"America/Guatemala":["Guatemala City","GT",14.64072,-90.51327],"America/Managua":["Managua","NI",12.13282,-86.2504],"Asia/Jerusalem":["Jerusalem","IL",31.76904,35.21633],"America/Jamaica":["Kingston","JM",17.99702,-76.79358],"America/Chihuahua":["Chihuahua","MX",28.63528,-106.08889],"America/Campo_Grande":["Campo Grande","BR",-20.44278,-54.64639],"Asia/Bishkek":["Bishkek","KG",42.87,74.59],"America/Cancun":["Cancún","MX",21.17429,-86.84656],"America/Indiana/Indianapolis":["Indianapolis","US",39.76838,-86.15804],"Europe/Amsterdam":["Rotterdam","NL",51.9225,4.47917],"America/Tegucigalpa":["Tegucigalpa","HN",14.0818,-87.20681],"Africa/Libreville":["Libreville","GA",0.39241,9.45356],"Europe/Saratov":["Саратов","RU",51.54048,45.9901],"Asia/Ulaanbaatar":["Ulan Bator","MN",47.90771,106.88324],"Asia/Vientiane":["Vientiane","LA",17.96667,102.6],"Africa/Bangui":["Bangui","CF",4.36122,18.55496],"America/Hermosillo":["Hermosillo","MX",29.08874,-110.96677],"America/Mazatlan":["Culiacán","MX",24.80209,-107.39421],"Africa/Freetown":["Freetown","SL",8.48714,-13.2356],"Asia/Muscat":["Muscat","OM",23.58413,58.40778],"Africa/Bujumbura":["Bujumbura","BI",-3.38193,29.36142],"America/Winnipeg":["Winnipeg","CA",49.8844,-97.14704],"Europe/Riga":["Riga","LV",56.946,24.10589],"America/Denver":["Denver","US",39.73915,-104.9847],"Europe/Sarajevo":["Sarajevo","BA",43.84864,18.35644],"Africa/Tunis":["Tunis","TN",36.81897,10.16579],"Asia/Pontianak":["Pontianak","ID",-0.03194,109.325],"Asia/Dushanbe":["Dushanbe","TJ",38.53575,68.77905],"Africa/Porto-Novo":["Cotonou","BJ",6.36536,2.41833],"Europe/Athens":["Athens","GR",37.98376,23.72784],"Europe/Zagreb":["Zagreb","HR",45.81444,15.97798],"America/Vancouver":["Vancouver","CA",49.24966,-123.11934],"Europe/Helsinki":["Helsinki","FI",60.16952,24.93545],"Asia/Macau":["Macau","MO",22.20056,113.54611],"Asia/Colombo":["Colombo","LK",6.93548,79.84868],"America/Detroit":["Detroit","US",42.33143,-83.04575],"Asia/Kuwait":["Al Aḩmadī","KW",29.07694,48.08389],"Europe/Chisinau":["Chisinau","MD",47.00902,28.85938],"Asia/Barnaul":["Барнаул","RU",53.36199,83.72786],"Europe/Ulyanovsk":["Сембер","RU",54.32824,48.38657],"Africa/Djibouti":["Djibouti","DJ",11.58901,43.14503],"America/Kentucky/Louisville":["Louisville","US",38.25424,-85.75941],"Asia/Irkutsk":["Іркутськ","RU",52.29566,104.29076],"Asia/Vladivostok":["Хабаровск","RU",48.46204,135.0971],"America/Cuiaba":["Cuiabá","BR",-15.59611,-56.09667],"Asia/Samarkand":["Samarkand","UZ",39.65456,66.96445],"America/Matamoros":["Reynosa","MX",26.08005,-98.28456],"Asia/Tomsk":["Томск","RU",56.50049,84.98216],"Africa/Asmara":["Asmara","ER",15.33805,38.93184],"Asia/Novokuznetsk":["Кемерава","RU",55.35417,86.10435],"America/Porto_Velho":["Porto Velho","BR",-8.76194,-63.90389],"America/Argentina/Tucuman":["San Miguel de Tucumán","AR",-26.81601,-65.21051],"Europe/Simferopol":["Акъяр","UA",44.60795,33.52134],"Europe/Vilnius":["Vilnius","LT",54.68916,25.2798],"Europe/Astrakhan":["Астархаан","RU",46.34968,48.04076],"America/El_Salvador":["San Salvador","SV",13.68935,-89.18718],"America/Argentina/Salta":["Salta","AR",-24.80645,-65.41999],"Europe/Lisbon":["Lisbon","PT",38.72509,-9.1498],"Europe/Kirov":["Киров","RU",58.59809,49.65783],"Asia/Aqtobe":["Aktobe","KZ",50.27969,57.20718],"Asia/Kuching":["Kota Kinabalu","MY",5.9749,116.0724],"Europe/Kaliningrad":["Калининград","RU",54.70639,20.51102],"Europe/Skopje":["Skopje","MK",41.99646,21.43141],"America/Halifax":["Halifax","CA",44.64269,-63.57688],"Africa/Juba":["Juba","SS",4.85165,31.58247],"Africa/Bissau":["Bissau","GW",11.86357,-15.59767],"Asia/Hebron":["East Jerusalem","PS",31.78336,35.23388],"Europe/Bratislava":["Bratislava","SK",48.14816,17.10674],"America/Boa_Vista":["Boa Vista","BR",2.81972,-60.67333],"America/Rio_Branco":["Rio Branco","BR",-9.97472,-67.81],"Europe/Tirane":["Tirana","AL",41.32744,19.81866],"America/Puerto_Rico":["San Juan","PR",18.46633,-66.10572],"Europe/Zurich":["Zürich","CH",47.36667,8.55],"Asia/Jayapura":["Jayapura","ID",-2.53371,140.71813],"Asia/Gaza":["Gaza","PS",31.50161,34.46672],"America/Panama":["Panama City","PA",8.9936,-79.51973],"Europe/Tallinn":["Tallinn","EE",59.43696,24.75353],"Africa/Windhoek":["Windhoek","NA",-22.55941,17.08323],"Atlantic/Canary":["Las Palmas de Gran Canaria","ES",28.10178,-15.41573],"America/Santarem":["Santarém","BR",-2.44306,-54.70833],"Africa/Maseru":["Maseru","LS",-29.31667,27.48333],"Asia/Qyzylorda":["Kyzylorda","KZ",44.85278,65.50917],"Pacific/Honolulu":["Honolulu","US",21.30694,-157.85833],"Asia/Chita":["Чита","RU",52.04311,113.49171],"Asia/Qatar":["Doha","QA",25.28545,51.53096],"Africa/Banjul":["Serekunda","GM",13.43833,-16.67806],"America/Costa_Rica":["San José","CR",9.93388,-84.08489],"Asia/Oral":["Oral","KZ",51.24601,51.42558],"America/Araguaina":["Palmas","BR",-10.16745,-48.32766],"Asia/Atyrau":["Atyrau","KZ",47.1048,51.88427],"America/Anchorage":["Anchorage","US",61.21806,-149.90028],"Pacific/Port_Moresby":["Port Moresby","PG",-9.47723,147.15089],"Europe/Ljubljana":["Ljubljana","SI",46.05108,14.50513],"America/Regina":["Saskatoon","CA",52.13238,-106.66892],"America/Argentina/Jujuy":["San Salvador de Jujuy","AR",-24.1928,-65.29342],"Australia/Hobart":["Hobart","AU",-42.87936,147.32941],"Africa/Gaborone":["Gaborone","BW",-24.65451,25.90859],"Europe/Podgorica":["Podgorica","ME",42.44124,19.26309],"America/Boise":["Boise","US",43.6135,-116.20345],"Asia/Yakutsk":["Дьокуускай","RU",62.03114,129.72288],"America/Guyana":["Georgetown","GY",6.80448,-58.15527],"America/Nassau":["Nassau","BS",25.05823,-77.34306],"America/Paramaribo":["Paramaribo","SR",5.86638,-55.16682],"Asia/Qostanay":["Kostanay","KZ",53.21435,63.62463],"Asia/Nicosia":["Nicosia","CY",35.17284,33.35397],"Asia/Sakhalin":["Южна-Сахалінск","RU",46.9543,142.73559],"Africa/El_Aaiun":["Laayoune","EH",27.1418,-13.18797],"America/Argentina/Mendoza":["Ciudad de Las Heras","AR",-32.85094,-68.83602],"Asia/Kamchatka":["Петропавловск Камчатски","RU",53.06393,158.62751],"America/Argentina/La_Rioja":["La Rioja","AR",-29.41328,-66.85637],"Asia/Bahrain":["Al Muharraq","BH",26.25722,50.61194],"Africa/Malabo":["Bata","GQ",1.86391,9.76582],"America/Argentina/San_Luis":["San Luis","AR",-33.2914,-66.32467],"America/Argentina/Catamarca":["Catamarca","AR",-28.46957,-65.78524],"Indian/Mauritius":["Port Louis","MU",-20.16194,57.49889],"Indian/Reunion":["Saint-Denis","RE",-20.88231,55.4504],"Asia/Dili":["Dili","TL",-8.55861,125.57361],"Asia/Aqtau":["Aktau","KZ",43.66105,51.17392],"Australia/Darwin":["Darwin","AU",-12.46113,130.84185],"Atlantic/Cape_Verde":["Praia","CV",14.93152,-23.51254],"America/Argentina/San_Juan":["Rawson","AR",-31.58189,-68.54211],"America/Curacao":["Willemstad","CW",12.12246,-68.88641],"Atlantic/Reykjavik":["Reykjavík","IS",64.13548,-21.89541],"America/Punta_Arenas":["Punta Arenas","CL",-53.16282,-70.90922],"Africa/Mbabane":["Manzini","SZ",-26.49884,31.38004],"America/St_Johns":["St. John's","CA",47.56494,-52.70931],"America/Glace_Bay":["Sydney","CA",46.1351,-60.1831],"Atlantic/Madeira":["Funchal","PT",32.66568,-16.92547],"Indian/Maldives":["Male","MV",4.17521,73.50916],"Asia/Thimphu":["Thimphu","BT",27.46609,89.64191],"America/Barbados":["Bridgetown","BB",13.10732,-59.62021],"America/Argentina/Rio_Gallegos":["Río Gallegos","AR",-51.6253,-69.25229],"Pacific/Noumea":["Nouméa","NC",-22.27407,166.44884],"Asia/Magadan":["Магадаан","RU",59.56274,150.80211],"Pacific/Fiji":["Nasinu","FJ",-18.07051,178.51313],"America/Martinique":["Fort-de-France","MQ",14.60365,-61.07418],"America/Moncton":["Moncton","CA",46.09454,-64.7965],"Africa/Ceuta":["Melilla","ES",35.29369,-2.93833],"Europe/Luxembourg":["Luxembourg","LU",49.60982,6.13268],"Indian/Comoro":["Moroni","KM",-11.70216,43.25506],"America/Port_of_Spain":["Chaguanas","TT",10.51667,-61.41667],"America/Belize":["Belize City","BZ",17.49952,-88.19756],"Asia/Brunei":["Bandar Seri Begawan","BN",4.89035,114.94006],"America/Cayenne":["Cayenne","GF",4.9381,-52.33455],"America/Argentina/Ushuaia":["Ushuaia","AR",-54.81084,-68.31591],"Pacific/Guadalcanal":["Honiara","SB",-9.43333,159.95],"Indian/Mayotte":["Mamoudzou","YT",-12.78234,45.22878],"America/Guadeloupe":["Les Abymes","GP",16.273,-61.50507],"Africa/Sao_Tome":["São Tomé","ST",0.33756,6.7299],"America/Antigua":["Saint John’s","AG",17.12096,-61.84329],"America/St_Thomas":["Saint Croix","VI",17.72751,-64.74698],"Pacific/Saipan":["Saipan","MP",15.21233,145.7545],"America/Coyhaique":["Coyhaique","CL",-45.57524,-72.06619],"Pacific/Guam":["Dededo Village","GU",13.51777,144.8391],"America/Eirunepe":["Benjamin Constant","BR",-4.37555,-70.03179],"Asia/Famagusta":["Famagusta","CY",35.12489,33.94135],"Pacific/Apia":["Apia","WS",-13.83333,-171.76666],"Pacific/Tarawa":["Tarawa","KI",1.3278,172.97696],"Pacific/Bougainville":["Arawa","PG",-6.22977,155.56598],"Pacific/Efate":["Port-Vila","VU",-17.73648,168.31366],"Europe/Monaco":["Monaco","MC",43.73718,7.42145],"Europe/Malta":["San Pawl il-Baħar","MT",35.95064,14.41561],"America/Juneau":["Juneau","US",58.30194,-134.41972],"Asia/Hovd":["Ulaangom","MN",49.98111,92.06667],"America/Aruba":["Oranjestad","AW",12.52398,-70.02703],"Pacific/Tahiti":["Faaa","PF",-17.55933,-149.60352],"America/Cayman":["George Town","KY",19.2866,-81.37436],"America/Whitehorse":["Whitehorse","CA",60.71611,-135.05375],"America/Ojinaga":["Ojinaga","MX",29.56689,-104.54487],"Europe/Jersey":["Saint Helier","JE",49.18804,-2.10491],"Europe/Gibraltar":["Gibraltar","GI",36.14474,-5.35257],"Europe/Isle_of_Man":["Douglas","IM",54.15,-4.48333],"Pacific/Majuro":["Majuro","MH",7.08971,171.38027],"America/St_Lucia":["Gros Islet","LC",14.06667,-60.95],"America/St_Vincent":["Kingstown","VC",13.15527,-61.22742],"America/Grand_Turk":["Providenciales","TC",21.78254,-72.25206],"Indian/Mahe":["Victoria","SC",-4.62001,55.45501],"Pacific/Tongatapu":["Nuku‘alofa","TO",-21.13683,-175.20114],"America/Dawson_Creek":["Fort St. John","CA",56.24988,-120.85292],"America/North_Dakota/New_Salem":["Mandan","US",46.82666,-100.88958],"Europe/Andorra":["Andorra la Vella","AD",42.50779,1.52109],"America/Bahia_Banderas":["Mezcales","MX",20.73039,-105.283],"Atlantic/Azores":["Ponta Delgada","PT",37.73952,-25.66874],"Australia/Broken_Hill":["Broken Hill","AU",-31.9652,141.4512],"America/Swift_Current":["Swift Current","CA",50.28337,-107.80135],"America/Dominica":["Roseau","DM",15.30174,-61.38808],"Europe/Guernsey":["Saint Peter Port","GG",49.45981,-2.53527],"Asia/Anadyr":["Анадир","RU",64.73424,177.5103],"America/Indiana/Vincennes":["Jasper","US",38.39144,-86.93111],"Pacific/Kwajalein":["Ebaye","MH",8.77479,167.73919],"America/Nuuk":["Nuuk","GL",64.18347,-51.72157],"Pacific/Palau":["Koror","PW",7.33978,134.47326],"Pacific/Chuuk":["Weno","FM",7.44648,151.84135],"Pacific/Rarotonga":["Avarua","CK",-21.2075,-159.77546],"Atlantic/Faroe":["Tórshavn","FO",62.00973,-6.77164],"America/St_Kitts":["Basseterre","KN",17.2955,-62.72499],"Pacific/Galapagos":["Puerto Ayora","EC",-0.74018,-90.3138],"Pacific/Pago_Pago":["Pago Pago","AS",-14.27806,-170.7025],"Atlantic/Bermuda":["Pembroke Parish","BM",32.30019,-64.79204],"Europe/Mariehamn":["Mariehamn","AX",60.09726,19.93481],"America/Kralendijk":["Kralendijk","BQ",12.15,-68.26667],"Pacific/Kosrae":["Tofol","FM",5.32479,163.00781],"Europe/San_Marino":["Serravalle","SM",43.96897,12.48167],"America/Sitka":["Sitka","US",57.05315,-135.33088],"America/Lower_Princes":["Cul de Sac","SX",18.04852,-63.06513],"America/Tortola":["Road Town","VG",18.42693,-64.62079],"America/Menominee":["Menominee","US",45.10776,-87.61427],"America/Goose_Bay":["Happy Valley-Goose Bay","CA",53.3038,-60.32576],"America/Grenada":["Saint George's","GD",12.05288,-61.75226],"America/Iqaluit":["Iqaluit","CA",63.74697,-68.51727],"Pacific/Easter":["Hanga Roa","CL",-27.15253,-109.42438],"America/Indiana/Tell_City":["Tell City","US",37.95144,-86.76777],"Pacific/Pohnpei":["Palikir","FM",6.92477,158.16109],"America/Marigot":["Grand-Case","MF",18.10476,-63.05358],"Pacific/Funafuti":["Funafuti","TV",-8.52425,179.19417],"America/Miquelon":["Saint-Pierre","PM",46.77914,-56.1773],"America/Kentucky/Monticello":["Monticello","US",36.82979,-84.84911],"Europe/Vaduz":["Schaan","LI",47.16498,9.50867],"America/St_Barthelemy":["Gustavia","BL",17.89618,-62.84978],"America/Creston":["Creston","CA",49.09987,-116.50211],"Atlantic/St_Helena":["Georgetown","SH",-7.92861,-14.41194],"Pacific/Chatham":["Wairau Valley","NZ",-36.77235,174.74107],"America/Blanc-Sablon":["Saint-Augustin","CA",51.22602,-58.65017],"America/Nome":["Nome","US",64.50111,-165.40639],"America/Indiana/Knox":["Knox","US",41.29588,-86.62501],"America/North_Dakota/Beulah":["Beulah","US",47.26334,-101.77795],"America/Inuvik":["Inuvik","CA",68.36166,-133.72817],"America/Noronha":["Vila dos Remédios","BR",-3.84205,-32.4107],"Indian/Chagos":["Downtown","IO",-7.26229,72.37676],"America/Rankin_Inlet":["Rankin Inlet","CA",62.80906,-92.08534],"America/Atikokan":["Atikokan","CA",48.75667,-91.62409],"America/Fort_Nelson":["Fort Nelson","CA",58.80533,-122.7002],"America/Indiana/Winamac":["Winamac","US",41.05143,-86.60306],"Pacific/Nauru":["Arijejen","NR",-0.52545,166.91247],"Arctic/Longyearbyen":["Longyearbyen","SJ",78.22334,15.64689],"America/Indiana/Petersburg":["Petersburg","US",38.49199,-87.27862],"Atlantic/Stanley":["Stanley","FK",-51.69382,-57.85701],"America/Anguilla":["The Valley","AI",18.21704,-63.05783],"Pacific/Kiritimati":["Tabwakea Village","KI",2.01643,-157.48773],"Pacific/Marquesas":["Atuona","PF",-9.80342,-139.04202],"America/Cambridge_Bay":["Cambridge Bay","CA",69.11489,-105.05484],"America/Indiana/Vevay":["Vevay","US",38.74784,-85.06717],"Europe/Busingen":["Büsingen","DE",47.69638,8.68759],"America/Metlakatla":["Metlakatla","US",55.12905,-131.57698],"America/Dawson":["Dawson City","CA",64.06013,-139.43328],"Indian/Christmas":["Flying Fish Cove","CX",-10.42172,105.67912],"Pacific/Wallis":["Mata-Utu","WF",-13.28163,-176.17453],"Pacific/Gambier":["Rikitea","PF",-23.12322,-134.96858],"America/Montserrat":["Brades","MS",16.79183,-62.21058],"Pacific/Norfolk":["Kingston","NF",-29.05459,167.96628],"Europe/Vatican":["Vatican City","VA",41.90268,12.45414],"America/Indiana/Marengo":["English","US",38.3345,-86.46415],"Pacific/Niue":["Alofi","NU",-19.05294,-169.91957],"America/North_Dakota/Center":["Center","US",47.11638,-101.29959],"Pacific/Fakaofo":["Nukunonu","TK",-9.20045,-171.84804],"Indian/Cocos":["West Island","CC",-12.15681,96.82251],"Pacific/Pitcairn":["Adamstown","PN",-25.06597,-130.10147],"Indian/Kerguelen":["Port-aux-Français","TF",-49.34916,70.21937],"Atlantic/South_Georgia":["Grytviken","GS",-54.28111,-36.5092]};

const canonicalZones = new Map();
function normalizeZone(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_+\/-]{1,80}$/.test(value)) return null;
  if (canonicalZones.has(value)) return canonicalZones.get(value);
  try {
    const zone = new Intl.DateTimeFormat('en', {timeZone:value}).resolvedOptions().timeZone;
    canonicalZones.set(value,zone);
    return zone;
  } catch { return null; }
}
let canonicalCities;
function referenceCity(value) {
  const timeZone = normalizeZone(value) || 'UTC';
  const preset = CITIES.find(city => normalizeZone(city.timeZone) === timeZone);
  if (preset) return {...preset,timeZone,automatic:true};
  let row = Object.hasOwn(ZONE_CITIES,timeZone) ? ZONE_CITIES[timeZone] : null;
  if (!row) {
    canonicalCities ??= new Map(Object.entries(ZONE_CITIES).map(([zone,city]) => [normalizeZone(zone),city]));
    row = canonicalCities.get(timeZone);
  }
  if (!row) return {name:timeZone,country:'',timeZone,fixedHour:18,automatic:true};
  const [name,country,latitude,longitude] = row;
  return {name,country,latitude,longitude,timeZone,automatic:true};
}
const FIRST_WEEK = Date.UTC(2026, 10, 25);
function weekFor(instant, timeZone) {
  const {year,month,day} = civilParts(new Date(instant),timeZone);
  const calendarDay = Date.UTC(year,month-1,day);
  return calendarDay - ((new Date(calendarDay).getUTCDay()+4)%7)*dayMs;
}
function weekWindow(week, place) {
  const friday = week + 2*dayMs;
  const window = weekendSchedule(friday,place,place.timeZone);
  return window || {
    start:localHour(friday,0,place.timeZone),
    end:localHour(friday+2*dayMs,0,place.timeZone),
  };
}
function sunset(date, latitude, longitude, timeZone) {
  if (!validCoordinates({latitude, longitude}) || !Number.isFinite(+date)) return null;
  const lw = -longitude * rad, phi = latitude * rad;
  // Anchor to local civil noon, including this day's own DST offset.
  let dt;
  if (timeZone) {
    const p = civilParts(date, timeZone);
    dt = solarDayTransit(new Date(localHour(Date.UTC(p.year,p.month-1,p.day),12,timeZone)),lw);
  } else dt = solarDayTransit(date, lw, -date.getTimezoneOffset());
  const dec = sunCoords(toDaysTT(dt)).dec;
  const set = getSetJ(-0.833 * rad, dt, 1, lw, phi, dec);
  return Number.isFinite(set) ? +fromJulian(set + J2000) : null;
}
function weekendSchedule(fridayDay, {latitude, longitude, fixedHour}, timeZone) {
  if (fixedHour === 18) return {
    start:localHour(fridayDay,fixedHour,timeZone),
    end:localHour(fridayDay+dayMs,fixedHour,timeZone),
  };
  const sunsetOn = day => sunset(new Date(localHour(day, 12, timeZone)), latitude, longitude, timeZone);
  const start = sunsetOn(fridayDay), end = sunsetOn(fridayDay + dayMs);
  return start !== null && end !== null && end > start ? {start, end} : null;
}
function state(now, place) {
  const date = new Date(now);
  if (!Number.isFinite(+date)) return {allowed:false, reason:'clock'};
  const timeZone = place?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let p;
  try { p = civilParts(date,timeZone); } catch { return {allowed:false,reason:'clock'}; }
  const calendarDay = Date.UTC(p.year,p.month-1,p.day), weekday = new Date(calendarDay).getUTCDay();
  const weekend = weekday === 5 || weekday === 6;
  const midnight = localHour(calendarDay+dayMs,0,timeZone);
  if (!validCoordinates(place) && place?.fixedHour !== 18) return {allowed:!weekend, reason:weekend?'location':'open', nextChange:+midnight};
  const fridayDay = calendarDay - (weekday+2)%7 * dayMs;
  const current = weekendSchedule(fridayDay, place, timeZone);
  const cityFrozen = weekday === 4 || weekday === 5;
  if (!current && weekend) return {allowed:false, reason:'polar', cityFrozen, nextChange:midnight};
  if (current && now < current.end) {
    const allowed = now < current.start;
    return {allowed, reason:allowed?'open':'sabbath', cityFrozen, ...current, nextChange:allowed?Math.min(current.start,midnight):current.end};
  }
  const next = weekendSchedule(fridayDay + 7 * dayMs, place, timeZone);
  return {allowed:true, reason:'open', cityFrozen, start:next?.start, end:next?.end, nextChange:Math.min(next?.start ?? midnight, midnight)};
}
const api = Object.freeze({GAME_IDS, CITIES, validCoordinates, validCity, sunset, state, dayMs, normalizeZone, referenceCity, weekFor, weekWindow, FIRST_WEEK});
root.SabbathClock = api;
if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);

