import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userIds = [...new Set(String(process.env.SEED_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean))];

if (process.env.ALLOW_SEED_DATA !== 'true') {
  throw new Error('Refusing to write sample content. Set ALLOW_SEED_DATA=true only in a disposable development/test project.');
}
if (!supabaseUrl || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
if (userIds.length !== 10 || userIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) {
  throw new Error('SEED_USER_IDS must contain exactly 10 comma-separated UUIDs for existing Supabase Auth test users.');
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: { users = [] } = {}, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
const authUsers = new Map(users.map(user => [user.id, user]));
const missing = userIds.filter(id => !authUsers.has(id));
if (missing.length) throw new Error(`These IDs are not existing Auth users: ${missing.join(', ')}. Create 10 disposable test accounts first.`);

const { data: existingProfiles, error: profileError } = await supabase.from('profiles').select('id,username,display_name').in('id', userIds);
if (profileError) throw profileError;
const profileMap = new Map((existingProfiles || []).map(profile => [profile.id, profile]));
for (let i = 0; i < userIds.length; i++) {
  const id = userIds[i];
  if (profileMap.has(id)) continue; // Never overwrite a real user's profile.
  const authUser = authUsers.get(id);
  const name = String(authUser.user_metadata?.display_name || authUser.user_metadata?.full_name || `Demo Builder ${i + 1}`).slice(0, 80);
  const username = `hvseed_${String(i + 1).padStart(2, '0')}`;
  const { data, error } = await supabase.from('profiles').insert({ id, username, display_name: name, bio: 'Sample profile generated for local HackVerse testing.', profile_visibility: 'public' }).select('id,username,display_name').single();
  if (error) throw error;
  profileMap.set(id, data);
}

// Remove only the clearly marked test rows created by this script; normal user content is untouched.
const { data: oldSeedPosts, error: oldSeedError } = await supabase.from('posts').select('id').in('author_id', userIds).like('content', '[HV13-SEED]%');
if (oldSeedError) throw oldSeedError;
const oldIds = (oldSeedPosts || []).map(row => row.id);
if (oldIds.length) {
  const { error: deleteVotesError } = await supabase.from('votes').delete().in('post_id', oldIds); if (deleteVotesError) throw deleteVotesError;
  const { error: deleteCommentsError } = await supabase.from('comments').delete().in('post_id', oldIds); if (deleteCommentsError) throw deleteCommentsError;
  const { error: deleteRepostsError } = await supabase.from('reposts').delete().in('post_id', oldIds); if (deleteRepostsError) throw deleteRepostsError;
  const { error: deletePostsError } = await supabase.from('posts').delete().in('id', oldIds); if (deletePostsError) throw deletePostsError;
}

const topics = [
  ['Open-source accessibility audit toolkit', 'A browser extension that flags common accessibility issues and creates actionable reports.', 'TypeScript, React, Playwright', 'accessibility'],
  ['Campus energy dashboard', 'A lightweight dashboard for understanding building energy usage and peak demand.', 'Next.js, Python, Supabase', 'climate'],
  ['Research paper companion', 'A reading workflow that turns long papers into structured notes and citation maps.', 'Python, FastAPI, embeddings', 'research'],
  ['Local-first team planner', 'An offline-first workspace for student teams to plan milestones and ship work.', 'Svelte, IndexedDB, TypeScript', 'productivity'],
  ['Public dataset explorer', 'Search and visualise public datasets with a reproducible query history.', 'Python, DuckDB, D3', 'data'],
  ['Design token inspector', 'A small tool for documenting design tokens across multiple interfaces.', 'Vite, CSS, Web Components', 'design'],
  ['Volunteer matching prototype', 'Match community projects with volunteers by interest, availability and skills.', 'React, Node.js, PostgreSQL', 'community'],
  ['Smart study sprint timer', 'A collaborative focus timer with team rooms and reflection prompts.', 'Vue, Supabase, Web Audio', 'learning'],
  ['API contract playground', 'Explore and test API contracts with example requests and response validation.', 'Node.js, OpenAPI, Zod', 'developer-tools'],
  ['Accessible event check-in', 'A mobile-first check-in flow designed to work with weak connectivity.', 'PWA, IndexedDB, QR', 'events']
];

const posts = Array.from({ length: 30 }, (_, index) => {
  const userIndex = index % 10;
  const topic = topics[index % topics.length];
  return {
    author_id: userIds[userIndex],
    content: `[HV13-SEED] ${topic[0]} — ${topic[1]} What would you improve next? #hackverse #${topic[3]}`,
    visibility: 'public',
    hashtags: ['hackverse', topic[3]],
    mentions: [],
    media_url: null,
    media_type: null
  };
});
const { data: insertedPosts, error: insertPostsError } = await supabase.from('posts').insert(posts).select('id,author_id');
if (insertPostsError) throw insertPostsError;

const follows = userIds.map((followerId, i) => ({ follower_id: followerId, following_id: userIds[(i + 1) % userIds.length], status: 'active', accepted_at: new Date().toISOString() }));
const { error: followsError } = await supabase.from('follows').upsert(follows, { onConflict: 'follower_id,following_id', ignoreDuplicates: true });
if (followsError) throw followsError;

const postByAuthor = new Map();
for (const post of insertedPosts || []) {
  if (!postByAuthor.has(post.author_id)) postByAuthor.set(post.author_id, []);
  postByAuthor.get(post.author_id).push(post.id);
}
const seedVotes = [];
for (let i = 0; i < userIds.length; i++) {
  const targetAuthor = userIds[(i + 1) % userIds.length];
  const targetPost = postByAuthor.get(targetAuthor)?.[0];
  if (targetPost) seedVotes.push({ user_id: userIds[i], post_id: targetPost, value: i % 4 === 0 ? 'downvote' : 'upvote' });
}
const { error: votesError } = await supabase.from('votes').upsert(seedVotes, { onConflict: 'user_id,post_id', ignoreDuplicates: true });
if (votesError) throw votesError;
const seedComments = userIds.map((id, i) => ({ post_id: postByAuthor.get(userIds[(i + 1) % userIds.length])?.[0], author_id: id, content: `[HV13-SEED] Useful prototype — I would love to test this with a small group.` })).filter(row => row.post_id);
const { error: commentsError } = await supabase.from('comments').insert(seedComments);
if (commentsError) throw commentsError;

console.log(`Seed complete: ${userIds.length} existing Auth users, ${insertedPosts?.length || 0} posts, ${follows.length} follow edges, ${seedVotes.length} votes and ${seedComments.length} comments.`);
console.log('Only rows marked [HV13-SEED] are replaced on repeat runs.');
