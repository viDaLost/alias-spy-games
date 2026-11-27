import { createHash, createHmac } from 'node:crypto';

const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken,
  TELEGRAM_BOT_TOKEN: botToken, ADMIN_TELEGRAM_ID: adminId, CORE_WORKER_URL: coreUrl } = process.env;
if (!accountId || !apiToken || !botToken || !adminId || !coreUrl) throw Error('Room cleanup environment is incomplete');
const origin='https://vidalost.github.io';

async function cloudflare(path) {
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/durable_objects/namespaces${path}`,{
    headers:{Authorization:`Bearer ${apiToken}`},signal:AbortSignal.timeout(30_000),
  });
  const data=await response.json();
  if(!response.ok||!data.success)throw Error(`Durable Object listing failed: HTTP ${response.status}`);
  return data;
}

async function adminSession() {
  const proof=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(adminId),first_name:'Room cleanup'})});
  const signed=[...proof].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(botToken).digest();
  proof.set('hash',createHmac('sha256',secret).update(signed).digest('hex'));
  const response=await fetch(`${coreUrl}/web/session`,{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({scope:'admin',telegramInitData:proof.toString()}),signal:AbortSignal.timeout(30_000),
  });
  const data=await response.json();
  if(!response.ok||!data.ok||!data.token)throw Error(`Admin session failed: HTTP ${response.status}`);
  return data.token;
}

const namespaces=await cloudflare('?per_page=1000');
const namespace=namespaces.result.find(item=>item.script==='alias-spy-games-bible-azbuka'&&item.class==='AzbukaRoom');
if(!namespace)throw Error('Production Azbuka namespace not found');
const ids=new Set();
let cursor='';
do {
  const query=new URLSearchParams({limit:'1000',...(cursor?{cursor}:{})});
  const page=await cloudflare(`/${namespace.id}/objects?${query}`);
  for(const object of page.result)if(object.hasStoredData)ids.add(object.id);
  const next=page.result_info?.cursor||page.result_info?.cursors?.after||'';
  if(page.result.length<1000||next===cursor)break;
  cursor=next;
}while(cursor);

const token=await adminSession();
const counts={closed:0,active:0,missing:0,skipped:0};
const objects=[...ids];
let remaining=0;
for(let i=0;i<objects.length;i+=20){
  let objectIds=objects.slice(i,i+20);
  for(let attempt=1;objectIds.length&&attempt<=3;attempt++){
    const response=await fetch(`${coreUrl}/azbuka/admin/rooms/sweep`,{
      method:'POST',headers:{Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({objectIds}),signal:AbortSignal.timeout(60_000),
    });
    const data=await response.json();
    if(!response.ok&&!Array.isArray(data.failedObjectIds))throw Error(`Room cleanup batch failed: HTTP ${response.status}`);
    for(const key of Object.keys(counts))counts[key]+=Number(data[key]||0);
    objectIds=data.failedObjectIds||[];
    if(objectIds.length){
      console.log(`Room cleanup retry ${attempt}: ${objectIds.length} objects; ${data.failureReasons?.join('; ')||'room request failed'}`);
      if(attempt===3)console.log(`Unreachable room references: ${objectIds.map(id=>createHash('sha256').update(id).digest('hex').slice(0,12)).join(', ')}`);
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,2000));
    }
  }
  remaining+=objectIds.length;
}
console.log(`Azbuka room cleanup: ${objects.length} stored objects checked, ${counts.closed} closed, ${counts.active} active, ${counts.missing} missing, ${counts.skipped} directory/duplicates skipped.`);
if(remaining)throw Error(`Room cleanup incomplete: ${remaining} objects could not be checked`);
