const {guard}=require('./_discovery-admin');
module.exports=async function(req,res){if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});try{await guard(req);const {runDiscovery}=require('../functions');const result=await runDiscovery();res.json(result);}catch(e){console.error(e);res.status(e.status||500).json({error:e.message||'Discovery failed.'});}};
