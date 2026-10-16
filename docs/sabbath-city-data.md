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
text, chosen city, coordinates or time zone in the request. Searching and sunset
calculation run locally; only the chosen city is saved in localStorage. No device
location APIs, permissions or IP-location services are used. Previous device
location records are deleted. Moscow is the default; Berlin and Kyiv are quick
choices. A saved choice also works without the catalog or a network connection.
The catalog is excluded from eager service-worker precaching and translations.

Catalog schema: `{version:1, source, license, zones, cities}`. Each city is
`[name, normalizedSearchAliases, countryCode, latitude, longitude, zoneIndex]`.
Sunset is calculated at the city's center. Local calendar days and displayed
schedule times use its IANA time zone, including seasonal clock changes. The
pause lasts exactly 86,400,000 milliseconds from Friday sunset. A city with no
sunset on the relevant date shows an explicit unavailable state.
