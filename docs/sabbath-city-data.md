# Local city search and sunset schedule

`web/data/sabbath-cities.json` contains 171,306 populated places from the GeoNames
cities1000 extract downloaded on 2026-10-16:
https://download.geonames.org/export/dump/cities1000.zip

GeoNames data is licensed under CC BY 4.0:
https://www.geonames.org/export/ and https://creativecommons.org/licenses/by/4.0/
The city picker includes source attribution. The compact catalog retains names,
selected alternate names for search, country codes, city-center coordinates and
IANA time-zone identifiers. It is sorted by population so ambiguous search
results prefer larger cities. Population and source identifiers are not stored.

The browser downloads the same static catalog for every search, with no search
text or coordinates in the request. It uses the device time zone and its
largest catalog city (a preset for Moscow, Berlin and Kyiv) as an approximate
schedule. Zones without a reference city use 18:00 local time. No location
permission, IP geolocation, or device coordinates are used. For guests, a city
choice is stored on the device. For signed-in players it is saved to their
account after they choose it so the rule works on their other devices.
The catalog is excluded from eager service-worker precaching and translations.

Catalog schema: `{version:1, source, license, zones, cities}`. Each city is
`[name, normalizedSearchAliases, countryCode, latitude, longitude, zoneIndex]`.
Sunset is calculated at the city's center. Local calendar days and displayed
schedule times use its IANA time zone, including seasonal clock changes. The
pause starts at Friday sunset and ends at the separately calculated Saturday
sunset. A city without a sunset on either date shows an unavailable state.
Each weekly confirmation opens at the start of local Wednesday, beginning
November 25, 2026. The in-app prompt remains mandatory until a city is chosen,
including on a late return. Confirmation locks the choice through Saturday's
sunset. A late confirmation preserves the schedule already fixed for that
weekend. The owner-only Cities tab includes all registered users. Changes
within the 30-day observation period are counted, excluding the initial
selection and repeats of the same city. The report shows the current city,
time zone, count and last change, and retains the aggregate after collection
stops.

The client retrieves UTC time from the core Worker's uncached public clock.
Requests carry no location, query, or authentication data. The session clock
advances by monotonic elapsed time and refreshes in the foreground. An offline
session can use an in-memory reading for up to six hours, unless elapsed times
diverge after a device clock adjustment or sleep. After a restart without a
server reading, only the five scheduled games and city selection wait for
verification. Other games remain available.
