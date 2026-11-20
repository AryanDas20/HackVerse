'use strict';

const { createClient } = require('@supabase/supabase-js');
const { analyzeResumeGap } = require('./lib/resume-gap');

const noStore = (res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
};
const fail = (res, status, error) => res.status(status).json({ error });

let cachedClient = null;
function getSupabase() {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw Object.assign(new Error('Career Match is not configured. Add the existing Supabase server environment variables in Vercel.'), { status: 503 });
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cachedClient;
}

async function requireUser(client, req) {
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error('Sign in to analyse a resume.'), { status: 401 });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error('Your session has expired. Sign in again.'), { status: 401 });
  const { data: allowed, error: rateError } = await client.rpc('social_rate_limit', {
    p_user_id: data.user.id,
    p_action: 'career-match',
    p_max: 10,
    p_window_seconds: 600
  });
  if (rateError) throw Object.assign(new Error('Could not validate the analysis rate. Please retry.'), { status: 503 });
  if (allowed !== true) throw Object.assign(new Error('You have reached the analysis limit. Try again in a few minutes.'), { status: 429 });
  return data.user;
}

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed.');
  try {
    const client = getSupabase();
    await requireUser(client, req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const resumeText = String(body.resumeText || '').replace(/\u0000/g, '').trim();
    const jobDescription = String(body.jobDescription || '').replace(/\u0000/g, '').trim();
    if (resumeText.length < 30) return fail(res, 400, 'We could not extract enough text from this PDF. Try a text-based PDF or a clearer export.');
    if (resumeText.length > 60000) return fail(res, 413, 'The extracted resume is too long. Use a resume with fewer pages.');
    if (jobDescription.length < 30) return fail(res, 400, 'Paste a complete job description before analysing.');
    if (jobDescription.length > 30000) return fail(res, 413, 'The job description is too long. Keep it under 30,000 characters.');
    const result = analyzeResumeGap(resumeText, jobDescription);
    return res.status(200).json(result);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('Career Match analysis failed:', error);
    return fail(res, status, status >= 500 ? 'Career Match could not complete the analysis. Please try again.' : error.message);
  }
};
