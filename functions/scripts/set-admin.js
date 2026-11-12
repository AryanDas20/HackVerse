#!/usr/bin/env node
const uid=process.argv[2];
if(!uid){console.error('Usage: node scripts/set-admin.js SUPABASE_USER_UUID');process.exit(1);}
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key){console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');process.exit(1);}
fetch(`${url.replace(/\/$/,'')}/auth/v1/admin/users/${encodeURIComponent(uid)}`,{method:'PUT',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({app_metadata:{admin:true}})})
.then(async r=>{const text=await r.text();if(!r.ok)throw new Error(text||`HTTP ${r.status}`);console.log('Admin access enabled for',uid);})
.catch(e=>{console.error(e.message);process.exit(1);});
