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
location records are deleted. The home screen links directly to the city picker,
which displays the two local sunset times. Moscow is used until a city is chosen.
A saved choice also works without the catalog or a network connection.
The catalog is excluded from eager service-worker precaching and translations.

Catalog schema: `{version:1, source, license, zones, cities}`. Each city is
`[name, normalizedSearchAliases, countryCode, latitude, longitude, zoneIndex]`.
Sunset is calculated at the city's center. Local calendar days and displayed
schedule times use its IANA time zone, including seasonal clock changes. The
pause starts at Friday sunset and ends at the separately calculated Saturday
sunset. A city without a sunset on either date shows an unavailable state.
City selection is read-only from Thursday in the saved city's time zone
through the end of the Saturday pause. A picker left open switches to the
read-only schedule at the cutoff.

The client retrieves UTC time from the core Worker's uncached public clock.
Requests carry no location, query, or authentication data. The session clock
advances by monotonic elapsed time and refreshes in the foreground. An offline
session can use an in-memory reading for up to six hours, unless elapsed times
diverge after a device clock adjustment or sleep. After a restart without a
server reading, only the five scheduled games and city selection wait for
verification. Other games remain available.
