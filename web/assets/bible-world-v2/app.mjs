const entry = new URL('./play.html', import.meta.url);
entry.search = location.search;
entry.hash = location.hash;
location.replace(entry);
