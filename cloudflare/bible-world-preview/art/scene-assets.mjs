export const sceneAssets = Object.freeze(Object.fromEntries([
 ['babel','v6'],['temple','v3'],['galilee','v3'],
 ...['noah','red-sea','david','daniel','gideon','carmel','philip','axe','oil','fleece','eutychus','prison'].map(id=>[id,['red-sea','gideon','eutychus','prison'].includes(id)?'v2':'v1'])
].map(([id,version])=>[id,`${id}-360-${version}-4k.webp`])));
