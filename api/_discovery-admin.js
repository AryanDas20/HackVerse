const { createClient } = require('@supabase/supabase-js');
const crypto=require('node:crypto');
function clients(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase is not configured.');return {auth:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})};}
async function guard(req){const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];if(!token)throw Object.assign(new Error('Sign in first.'),{status:401});const {auth}=clients();const {data,error}=await auth.auth.getUser(token);if(error||!data?.user)throw Object.assign(new Error('Your sign-in has expired.'),{status:401});const u=data.user;if(u.app_metadata?.admin!==true)throw Object.assign(new Error('This action requires a HackVerse admin account.'),{status:403});return {user:u};}
async function sourceClient(){const {db}=clients();return db;}
module.exports={guard,clients,sourceClient};
