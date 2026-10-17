export const sceneAssets = Object.freeze(Object.fromEntries([
 ['babel','v6'],['temple','v3'],['galilee','v3'],
 ...['noah','red-sea','david','daniel','gideon','carmel','philip','axe','oil','fleece','eutychus','prison'].map(id=>[id,['red-sea','gideon','carmel','eutychus','prison'].includes(id)?'v2':'v1'])
].map(([id,version])=>[id,`${id}-360-${version}-seams2-4k.webp`])));
