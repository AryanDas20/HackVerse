const { createClient } = require("@supabase/supabase-js");
const { plainText, safeHttpUrl, validatePost, validateReport, USERNAME_RE } = require("../lib/social");

const noStore = res => { res.setHeader("Cache-Control", "no-store"); res.setHeader("Vary", "Authorization"); };
const fail = (res, status, error) => res.status(status).json({ error });
let cachedClient = null;
function clients() {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error("Social features are not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel."), { status: 503 });
  cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cachedClient;
}
// Warm serverless instances reuse verified tokens for a short time, which removes
// one Supabase Auth round-trip from almost every request.
const AUTH_TTL_MS = 30 * 1000;
const authCache = new Map();
async function authenticate(client, req) {
  const token = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error("Sign in to use the community."), { status: 401 });
  const hit = authCache.get(token);
  if (hit && hit.expires > Date.now()) return hit.user;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) { authCache.delete(token); throw Object.assign(new Error("Your session has expired. Sign in again."), { status: 401 }); }
  if (authCache.size > 500) authCache.clear();
  authCache.set(token, { user: data.user, expires: Date.now() + AUTH_TTL_MS });
  return data.user;
}
async function rateLimit(client, user, action, max = 20, seconds = 60) {
  const { data, error } = await client.rpc("social_rate_limit", { p_user_id: user.id, p_action: action, p_max: max, p_window_seconds: seconds });
  if (error) throw Object.assign(new Error("Could not validate the request rate. Please retry."), { status: 503 });
  if (data !== true) throw Object.assign(new Error("You're doing that a little too quickly. Please wait and try again."), { status: 429 });
}
async function getProfileByUsername(client, username) {
  const clean = plainText(username, 24).replace(/^@/, "").toLowerCase();
  if (!USERNAME_RE.test(clean)) throw Object.assign(new Error("Enter a valid username."), { status: 400 });
  const { data, error } = await client.from("profiles").select("*").eq("username_lower", clean).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("That profile could not be found."), { status: 404 });
  return data;
}
async function canViewProfile(client, viewerId, profile) {
  if (viewerId === profile.id) return true;
  const { data: blocked, error: blockError } = await client.from("user_blocks").select("blocker_id,blocked_id").or(`and(blocker_id.eq.${viewerId},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${viewerId})`).limit(1);
  if (blockError) throw blockError;
  if (blocked?.length) return false;
  const visibility = profile.profile_visibility || (profile.is_private ? "private" : "public");
  if (visibility === "public") return true;
  const { data, error } = await client.from("follows").select("id").eq("follower_id", viewerId).eq("following_id", profile.id).eq("status", "active").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// Loads a post and runs every visibility check in parallel (2 round-trips instead of up to 5).
// Returns the post plus the author profile so callers don't have to fetch it again.
async function loadVisiblePost(client, postId, viewerId, { withVote = false } = {}) {
  const id = String(postId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Object.assign(new Error("This post is no longer available."), { status: 404 });
  const { data, error } = await client.from("posts").select("*").eq("id", id).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("This post is no longer available."), { status: 404 });
  const ownVotePromise = withVote ? client.from("votes").select("value").eq("user_id", viewerId).eq("post_id", data.id).maybeSingle() : null;
  const authorPromise = client.from("profiles").select("id,username,display_name,avatar_url,is_verified,is_private,profile_visibility").eq("id", data.author_id).maybeSingle();
  if (data.author_id === viewerId) {
    const [{ data: author }, vote] = await Promise.all([authorPromise, ownVotePromise || Promise.resolve({ data: null })]);
    return { post: data, author: author || null, viewerVote: vote?.data?.value || null };
  }
  const [blocks, authorResult, follows, vote] = await Promise.all([
    client.from("user_blocks").select("blocker_id").or(`and(blocker_id.eq.${viewerId},blocked_id.eq.${data.author_id}),and(blocker_id.eq.${data.author_id},blocked_id.eq.${viewerId})`).limit(1),
    authorPromise,
    client.from("follows").select("id").eq("follower_id", viewerId).eq("following_id", data.author_id).eq("status", "active").maybeSingle(),
    ownVotePromise || Promise.resolve({ data: null })
  ]);
  if (blocks.error) throw blocks.error;
  if (authorResult.error) throw authorResult.error;
  if (follows.error) throw follows.error;
  if (blocks.data?.length) throw Object.assign(new Error("This content is unavailable."), { status: 404 });
  const author = authorResult.data;
  const profileVisibility = author?.profile_visibility || (author?.is_private ? "private" : "public");
  const viewerVote = vote?.data?.value || null;
  if (data.visibility === "public" && profileVisibility === "public") return { post: data, author, viewerVote };
  if ((profileVisibility !== "public" || data.visibility === "followers") && follows.data && data.visibility !== "private") return { post: data, author, viewerVote };
  throw Object.assign(new Error("You don't have permission to view this post."), { status: 403 });
}
async function visiblePost(client, postId, viewerId) {
  return (await loadVisiblePost(client, postId, viewerId)).post;
}
function parseCursor(body) {
  if (!body.cursor) return null;
  const createdAt = new Date(body.cursor.createdAt || "");
  const id = String(body.cursor.id || "");
  if (!Number.isFinite(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { createdAt: createdAt.toISOString(), id };
}
async function getFollows(client, userId, direction) {
  const field = direction === "following" ? "follower_id" : "following_id";
  const other = direction === "following" ? "following_id" : "follower_id";
  const { data, error } = await client.from("follows").select(`${other},status,created_at`).eq(field, userId).eq("status", "active").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []).map(row => row[other]);
}
async function getPosts(client, query, userId) {
  const { data, error } = await query;
  if (error) throw error;
  const posts = data || [];
  if (!posts.length) return [];
  const postIds = posts.map(post => post.id);
  const authors = [...new Set(posts.map(p => p.author_id))];
  // All four lookups are independent, so they run together instead of one after another.
  const [votes, profiles, follows, blocks] = await Promise.all([
    client.from("votes").select("post_id,value").eq("user_id", userId).in("post_id", postIds),
    client.from("profiles").select("id,username,display_name,avatar_url,is_verified,is_private,profile_visibility").in("id", authors),
    client.from("follows").select("following_id").eq("follower_id", userId).eq("status", "active").in("following_id", authors),
    client.from("user_blocks").select("blocker_id,blocked_id").or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`).limit(1000)
  ]);
  for (const result of [votes, profiles, follows, blocks]) if (result.error) throw result.error;
  const voteMap = new Map((votes.data || []).map(v => [v.post_id, v.value]));
  const profileMap = new Map((profiles.data || []).map(p => [p.id, p]));
  const followed = new Set((follows.data || []).map(row => row.following_id));
  const blocked = new Set((blocks.data || []).map(row => row.blocker_id === userId ? row.blocked_id : row.blocker_id));
  const allowed = [];
  for (const post of posts) {
    const author = profileMap.get(post.author_id);
    if (blocked.has(post.author_id)) continue;
    if (!author || post.author_id === userId) { allowed.push({ ...post, viewer_vote: voteMap.get(post.id) || null, author: author || null }); continue; }
    const visibility = author.profile_visibility || (author.is_private ? "private" : "public");
    if (visibility === "public" && post.visibility === "public") { allowed.push({ ...post, viewer_vote: voteMap.get(post.id) || null, author }); continue; }
    if (visibility !== "public" && followed.has(author.id) && post.visibility !== "private") {
      allowed.push({ ...post, viewer_vote: voteMap.get(post.id) || null, author });
    }
  }
  return allowed;
}
async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return fail(res, 405, "Method not allowed.");
  let client, user;
  try {
    client = clients(); user = await authenticate(client, req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "");
    const readActions = new Set(["feed","profile","profile-stats","profile-tab","post-detail","comments","voters","my-reports","preferences","blocked-users"]);
    // Hot interaction paths run the rate-limit check alongside their reads; every write awaits it first.
    const deferredLimit = new Set(["vote","comment","repost","unrepost"]);
    let limitCheck = Promise.resolve();
    if (!readActions.has(action)) {
      const max = action === "create-post" ? 5 : action === "vote" ? 40 : action === "follow" ? 25 : action === "report" ? 4 : 20;
      limitCheck = rateLimit(client, user, action || "unknown", max, 60);
      if (deferredLimit.has(action)) limitCheck.catch(() => {}); else await limitCheck;
    }

    if (action === "sync-profile") {
      const username = plainText(body.username, 24).replace(/^@/, "");
      if (!USERNAME_RE.test(username)) return fail(res, 400, "Your profile needs a valid 3–24 character username before enabling the social profile.");
      const row = {
        id: user.id, username, display_name: plainText(body.displayName, 80) || "HackVerse member",
        bio: plainText(body.bio, 500), avatar_url: safeHttpUrl(body.avatarUrl), cover_url: safeHttpUrl(body.coverUrl),
        location: plainText(body.location, 120) || null, website: safeHttpUrl(body.website), github_url: safeHttpUrl(body.githubUrl), linkedin_url: safeHttpUrl(body.linkedinUrl), portfolio_url: safeHttpUrl(body.portfolioUrl), pronouns: plainText(body.pronouns, 50) || null,
        profile_visibility: ["public","followers","private"].includes(body.visibility) ? body.visibility : "public",
        is_private: body.visibility === "private" || body.visibility === "followers", updated_at: new Date().toISOString()
      };
      const { data, error } = await client.from("profiles").upsert(row, { onConflict: "id" }).select("*").single();
      if (error?.code === "23505") return fail(res, 409, "That username is already taken. Choose another one.");
      if (error) throw error;
      return res.status(200).json({ profile: data });
    }

    if (action === "feed") {
      const type = ["home","explore","following"].includes(body.type) ? body.type : "explore";
      const cursor = parseCursor(body);
      const following = type === "explore" ? [] : (await getFollows(client, user.id, "following")).filter(id => id !== user.id);
      const makeBase = () => client.from("posts").select("*").eq("is_deleted", false).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(21);
      const applyCursor = query => cursor ? query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`) : query;
      let rows = [];
      if (type === "explore") {
        rows = await getPosts(client, applyCursor(makeBase().eq("visibility", "public")), user.id);
      } else if (type === "following") {
        if (!following.length) return res.status(200).json({ posts: [], nextCursor: null });
        rows = await getPosts(client, applyCursor(makeBase().in("author_id", following).in("visibility", ["public", "followers"])), user.id);
      } else {
        const publicQuery = applyCursor(makeBase().eq("visibility", "public"));
        const followedQuery = following.length ? applyCursor(makeBase().in("author_id", following).eq("visibility", "followers")) : null;
        const [publicRows, followedRows] = await Promise.all([
          getPosts(client, publicQuery, user.id),
          followedQuery ? getPosts(client, followedQuery, user.id) : Promise.resolve([])
        ]);
        const merged = new Map([...publicRows, ...followedRows].map(post => [post.id, post]));
        rows = [...merged.values()].sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)));
      }
      const page = rows.slice(0, 20); const last = page.at(-1);
      return res.status(200).json({ posts: page, nextCursor: rows.length > 20 && last ? { createdAt: last.created_at, id: last.id } : null });
    }

    if (action === "profile-by-id") {
      const id=String(body.userId||"");
      if(!/^[0-9a-f-]{36}$/i.test(id))return fail(res,400,"Enter a valid profile ID.");
      const {data:profile,error}=await client.from("profiles").select("*").eq("id",id).maybeSingle();
      if(error)throw error;if(!profile)return fail(res,404,"This builder has not completed a community profile yet.");
      const allowed=await canViewProfile(client,user.id,profile);
      if(!allowed){
        const {data:request,error:requestError}=await client.from("follows").select("status").eq("follower_id",user.id).eq("following_id",profile.id).maybeSingle();
        if(requestError)throw requestError;
        const restrictedProfile={id:profile.id,username:profile.username,display_name:profile.display_name,avatar_url:profile.avatar_url,cover_url:profile.cover_url,is_verified:profile.is_verified,profile_visibility:profile.profile_visibility,follower_count:profile.follower_count,following_count:profile.following_count,post_count:profile.post_count,upvote_count:profile.upvote_count,created_at:profile.created_at};
        return res.status(200).json({profile:restrictedProfile,profileRestricted:true,followStatus:request?.status||null,hackathonCount:profile.hackathon_count||0});
      }
      return res.status(200).json({profile});
    }

    if (action === "post-detail") {
      const { post, author, viewerVote } = await loadVisiblePost(client, body.postId, user.id, { withVote: true });
      return res.status(200).json({ post: { ...post, viewer_vote: viewerVote, author } });
    }

    // Voter identities are returned only when the authenticated viewer may also
    // see those members' public profiles. Private/followers-only accounts and
    // blocked relationships are filtered on the server, never in the browser.
    if (action === "voters") {
      const postId = String(body.postId || "");
      const voteType = ["upvote", "downvote"].includes(body.voteType) ? body.voteType : "upvote";
      const offset = Math.max(0, Math.min(5000, Number.parseInt(body.offset, 10) || 0));
      const pageSize = 100;
      const post = await visiblePost(client, postId, user.id);
      const { data: votes, error: votesError, count } = await client.from("votes")
        .select("user_id,value,created_at", { count: "exact" })
        .eq("post_id", post.id).eq("value", voteType)
        .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
      if (votesError) throw votesError;
      const rows = votes || [];
      const ids = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
      const [profilesResult, followsResult, blocksResult] = await Promise.all([
        ids.length ? client.from("profiles").select("id,username,display_name,avatar_url,is_verified,profile_visibility,is_private").in("id", ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? client.from("follows").select("following_id").eq("follower_id", user.id).eq("status", "active").in("following_id", ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? client.from("user_blocks").select("blocker_id,blocked_id").or(`and(blocker_id.eq.${user.id},blocked_id.in.(${ids.join(",")})),and(blocked_id.eq.${user.id},blocker_id.in.(${ids.join(",")}))`) : Promise.resolve({ data: [], error: null })
      ]);
      for (const result of [profilesResult, followsResult, blocksResult]) if (result.error) throw result.error;
      const profiles = new Map((profilesResult.data || []).map(profile => [profile.id, profile]));
      const followed = new Set((followsResult.data || []).map(row => row.following_id));
      const blocked = new Set();
      for (const row of blocksResult.data || []) {
        blocked.add(row.blocker_id === user.id ? row.blocked_id : row.blocker_id);
      }
      let hiddenCount = 0;
      const voters = [];
      for (const vote of rows) {
        const profile = profiles.get(vote.user_id);
        if (!profile || blocked.has(vote.user_id)) { hiddenCount++; continue; }
        const visibility = profile.profile_visibility || (profile.is_private ? "private" : "public");
        if (vote.user_id !== user.id && visibility !== "public" && !followed.has(vote.user_id)) { hiddenCount++; continue; }
        voters.push({
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          is_verified: Boolean(profile.is_verified),
          vote_type: vote.value,
          voted_at: vote.created_at
        });
      }
      const total = Number(count || 0);
      return res.status(200).json({ voters, total, hiddenCount, nextOffset: offset + rows.length, hasMore: offset + rows.length < total, pageSize });
    }

    if (action === "profile-stats") {
      // This endpoint is account-scoped: it only returns the authenticated
      // member's own activity, including private hackathon participation.
      const [profileResult, buildResult, projectResult, historyResult, socialPostResult] = await Promise.all([
        client.from("profiles").select("post_count,upvote_count,follower_count,following_count").eq("id", user.id).maybeSingle(),
        client.from("documents").select("doc_id,data").eq("collection_path", "builderPosts").eq("owner_uid", user.id).limit(1000),
        client.from("documents").select("doc_id").eq("collection_path", "projects").eq("owner_uid", user.id).limit(1000),
        client.from("documents").select("doc_id,data").eq("collection_path", "hackathonHistory").eq("owner_uid", user.id).limit(1000),
        client.from("posts").select("id,upvote_count,comment_count").eq("author_id", user.id).eq("is_deleted", false).limit(1000)
      ]);
      for (const result of [profileResult, buildResult, projectResult, historyResult, socialPostResult]) {
        if (result.error) throw result.error;
      }
      const buildRows = buildResult.data || [];
      const buildIds = buildRows.map(row => row.doc_id).filter(Boolean);
      let legacyVotes = [], legacyComments = [];
      if (buildIds.length) {
        const [votesResult, commentsResult] = await Promise.all([
          client.from("documents").select("doc_id").eq("collection_path", "builderPostVotes").in("data->>postId", buildIds).limit(10000),
          client.from("documents").select("doc_id").eq("collection_path", "builderPostComments").in("data->>postId", buildIds).limit(10000)
        ]);
        if (votesResult.error) throw votesResult.error;
        if (commentsResult.error) throw commentsResult.error;
        legacyVotes = votesResult.data || [];
        legacyComments = commentsResult.data || [];
      }
      const socialPosts = socialPostResult.data || [];
      const history = (historyResult.data || []).map(row => row.data || {});
      const profile = profileResult.data || {};
      const builds = buildRows.length;
      const projects = (projectResult.data || []).length;
      const posts = Number(profile.post_count || 0);
      const socialLikes = profile.upvote_count != null
        ? Number(profile.upvote_count)
        : socialPosts.reduce((sum, row) => sum + Number(row.upvote_count || 0), 0);
      const socialComments = socialPosts.reduce((sum, row) => sum + Number(row.comment_count || 0), 0);
      const likesReceived = socialLikes + legacyVotes.length;
      const commentsReceived = socialComments + legacyComments.length;
      const winnerCount = history.filter(row => /winner|1st place|first place/i.test(String(row.outcome || ""))).length;
      const finalistCount = history.filter(row => /runner.?up|finalist|2nd place|second place/i.test(String(row.outcome || ""))).length;
      const recognitionCount = history.filter(row => /top\s*10|special mention|honou?rable mention/i.test(String(row.outcome || ""))).length;
      const pointsBreakdown = {
        builds: builds * 100,
        projects: projects * 60,
        posts: posts * 20,
        likes: likesReceived * 5,
        hackathons: history.length * 50,
        achievements: winnerCount * 100 + finalistCount * 50 + recognitionCount * 25
      };
      const points = Object.values(pointsBreakdown).reduce((sum, value) => sum + value, 0);
      return res.status(200).json({
        stats: {
          builds, projects, posts, likesReceived, commentsReceived, hackathons: history.length,
          followers: Number(profile.follower_count || 0), following: Number(profile.following_count || 0),
          points, pointsBreakdown, achievements: { winners: winnerCount, finalists: finalistCount, otherRecognition: recognitionCount }
        }
      });
    }

    if (action === "profile") {
      const profile = await getProfileByUsername(client, body.username);
      const allowed = await canViewProfile(client, user.id, profile);
      const visibility = profile.profile_visibility || (profile.is_private ? "private" : "public");
      if (!allowed) {
        const { data: request, error: requestError } = await client.from("follows").select("status").eq("follower_id",user.id).eq("following_id",profile.id).maybeSingle();
        if(requestError)throw requestError;
        const restrictedProfile = { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url, cover_url: profile.cover_url, is_verified: profile.is_verified, profile_visibility: visibility, follower_count: profile.follower_count, following_count: profile.following_count, post_count: profile.post_count, upvote_count: profile.upvote_count, created_at: profile.created_at };
        return res.status(200).json({ profile: restrictedProfile, profileRestricted: true, posts: [], nextCursor: null, followStatus: request?.status || null, followsYou: false, hackathons: [], hackathonCount: profile.hackathon_count || 0, followRequests: [] });
      }
      const cursor = parseCursor(body);
      let query = client.from("posts").select("*").eq("author_id", profile.id).eq("is_deleted", false).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(21);
      if (profile.id !== user.id) query = query.neq("visibility", "private");
      if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
      const posts = await getPosts(client, query, user.id);
      const [{ data: followRow }, { data: myFollow }, { data: participations }, { data: followRequests }] = await Promise.all([
        client.from("follows").select("status").eq("follower_id", user.id).eq("following_id", profile.id).maybeSingle(),
        client.from("follows").select("id").eq("follower_id", profile.id).eq("following_id", user.id).eq("status", "active").maybeSingle(),
        client.from("documents").select("doc_id,data").eq("collection_path", "hackathonHistory").eq("owner_uid", profile.id).limit(100),
        profile.id === user.id ? client.from("follows").select("id,created_at,profiles!follows_follower_id_fkey(id,username,display_name,avatar_url)").eq("following_id", user.id).eq("status", "pending").limit(50) : Promise.resolve({ data: [] })
      ]);
      const history = (participations || []).map(row => row.data || {}).filter(row => profile.id === user.id || row.visibility === "public").sort((a,b) => Number(b.year || 0)-Number(a.year || 0));
      return res.status(200).json({ profile, posts: posts.slice(0,20), nextCursor: posts.length > 20 ? { createdAt: posts[19].created_at, id: posts[19].id } : null, followStatus: followRow?.status || null, followsYou: Boolean(myFollow), hackathons: history, hackathonCount: profile.id === user.id ? (participations || []).length : Number(profile.hackathon_count || history.length), followRequests: (followRequests || []).map(row=>({id:row.id,created_at:row.created_at,profile:row.profiles})) });
    }

    if (action === "profile-tab") {
      const target = await getProfileByUsername(client, body.username);
      if (!(await canViewProfile(client,user.id,target))) return fail(res,403,"This profile is private.");
      const tab = ["posts","replies","media","likes","followers","following"].includes(body.tab) ? body.tab : "posts";
      let payload = [];
      if (tab === "followers" || tab === "following") {
        const field = tab === "followers" ? "following_id" : "follower_id"; const other = tab === "followers" ? "follower_id" : "following_id";
        const { data, error } = await client.from("follows").select(`created_at,profiles!${other}(id,username,display_name,avatar_url,is_verified)`).eq(field,target.id).eq("status","active").order("created_at",{ascending:false}).limit(100);
        if(error)throw error;
        const {data:myRows,error:myError}=await client.from("follows").select("following_id,status").eq("follower_id",user.id).limit(500);
        if(myError)throw myError;
        const myStatuses=new Map((myRows||[]).map(row=>[row.following_id,row.status]));
        payload=(data||[]).map(row=>row.profiles?({...row.profiles,follow_status:myStatuses.get(row.profiles.id)||null}):null).filter(Boolean);
      } else if(tab === "likes") {
        const { data, error } = await client.from("votes").select("post_id,value,posts(*)").eq("user_id",target.id).eq("value","upvote").order("created_at",{ascending:false}).limit(30);
        if(error)throw error;
        const liked=(data||[]).map(row=>row.posts).filter(post=>post&&!post.is_deleted&&post.visibility==="public");
        const authors=[...new Set(liked.map(post=>post.author_id))];
        const {data:profiles}=authors.length?await client.from("profiles").select("id,username,display_name,avatar_url,is_verified").in("id",authors):{data:[]};
        const profileMap=new Map((profiles||[]).map(profile=>[profile.id,profile]));
        payload=liked.map(post=>({...post,author:profileMap.get(post.author_id)||null}));
      } else if(tab === "replies") {
        const { data, error } = await client.from("comments").select("id,content,created_at,post_id,posts(id,content,author_id)").eq("author_id",target.id).eq("is_deleted",false).order("created_at",{ascending:false}).limit(30);
        if(error)throw error; payload=data||[];
      } else {
        let q=client.from("posts").select("*").eq("author_id",target.id).eq("is_deleted",false).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(21);
        if(target.id!==user.id)q=q.neq("visibility","private");
        if(tab === "media")q=q.not("media_url","is",null);
        const cursor=parseCursor(body); if(cursor)q=q.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
        const rows=await getPosts(client,q,user.id); payload=rows.slice(0,20);
        return res.status(200).json({ items: payload, nextCursor: rows.length>20&&payload.length?{createdAt:payload.at(-1).created_at,id:payload.at(-1).id}:null });
      }
      return res.status(200).json({ items: payload, nextCursor: null });
    }

    if (action === "create-post") {
      const post = validatePost(body);
      const { data: authorProfile, error: authorProfileError } = await client.from("profiles").select("profile_visibility,is_private").eq("id",user.id).maybeSingle();
      if(authorProfileError)throw authorProfileError;
      if(!authorProfile)return fail(res,409,"Complete your builder profile before publishing.");
      const accountVisibility=authorProfile.profile_visibility || (authorProfile.is_private?"private":"public");
      if(accountVisibility==="private" && post.visibility!=="private")return fail(res,403,"Your profile is private. Change profile visibility before publishing to others.");
      if(accountVisibility==="followers" && post.visibility==="public")post.visibility="followers";
      const { data, error } = await client.from("posts").insert({ ...post, author_id: user.id }).select("*").single();
      if (error) throw error;
      return res.status(201).json({ post: data });
    }

    if (action === "vote") {
      if (!["upvote","downvote"].includes(body.value)) return fail(res,400,"Choose an upvote or downvote.");
      const postId = String(body.postId || "");
      const [post, currentResult] = await Promise.all([
        visiblePost(client,postId,user.id),
        client.from("votes").select("id,value").eq("user_id",user.id).eq("post_id",/^[0-9a-f-]{36}$/i.test(postId)?postId:"00000000-0000-0000-0000-000000000000").maybeSingle()
      ]);
      if (post.author_id === user.id) return fail(res,400,"You cannot vote on your own post.");
      if (currentResult.error) throw currentResult.error;
      await limitCheck;
      const current = currentResult.data;
      let vote = body.value, notify = false;
      if (current?.value === body.value) { const {error}=await client.from("votes").delete().eq("id",current.id); if(error)throw error; vote = null; }
      else if (current) { const {error}=await client.from("votes").update({value:body.value,updated_at:new Date().toISOString()}).eq("id",current.id); if(error)throw error; }
      else { const {error}=await client.from("votes").insert({user_id:user.id,post_id:post.id,value:body.value}); if(error)throw error; notify = true; }
      // Counters are maintained by triggers inside the write, so one small read returns the authoritative totals.
      const [counts] = await Promise.all([
        client.from("posts").select("upvote_count,downvote_count").eq("id",post.id).maybeSingle(),
        notify ? client.from("notifications").insert({recipient_id:post.author_id,actor_id:user.id,type:body.value,post_id:post.id}) : Promise.resolve()
      ]);
      return res.status(200).json({ vote, upvote_count: counts.data?.upvote_count ?? null, downvote_count: counts.data?.downvote_count ?? null });
    }

    if (action === "comment") {
      const content = plainText(body.content,1200);
      if(!content)return fail(res,400,"Write a comment first.");
      const post = await visiblePost(client,body.postId,user.id);
      await limitCheck;
      const parentId = /^[0-9a-f-]{36}$/i.test(String(body.parentCommentId||"")) ? body.parentCommentId : null;
      const [inserted, authorResult] = await Promise.all([
        client.from("comments").insert({post_id:post.id,author_id:user.id,content,parent_comment_id:parentId}).select("*").single(),
        client.from("profiles").select("id,username,display_name,avatar_url").eq("id",user.id).maybeSingle()
      ]);
      if(inserted.error)throw inserted.error;
      const data = inserted.data;
      if(post.author_id!==user.id) {
        // The comment is already saved; a failed notification must not fail the request.
        const {error:notifyError}=await client.from("notifications").insert({recipient_id:post.author_id,actor_id:user.id,type:"comment",post_id:post.id,comment_id:data.id});
        if(notifyError)console.warn("Comment notification failed",notifyError.message);
      }
      return res.status(201).json({comment:{...data,author:authorResult.data||null}});
    }

    if (action === "delete-comment") {
      const commentId=String(body.commentId||"");
      const {data:comment,error:commentError}=await client.from("comments").select("id,author_id").eq("id",commentId).maybeSingle();
      if(commentError)throw commentError;
      if(!comment || comment.author_id!==user.id)return fail(res,404,"Comment not found or you do not own it.");
      const {error}=await client.from("comments").update({is_deleted:true,updated_at:new Date().toISOString()}).eq("id",commentId);
      if(error)throw error;return res.status(200).json({deleted:true});
    }

    if (action === "comments") {
      const postId = String(body.postId || "");
      const [post, commentResult] = await Promise.all([
        visiblePost(client,postId,user.id),
        client.from("comments").select("id,author_id,content,parent_comment_id,created_at").eq("post_id",/^[0-9a-f-]{36}$/i.test(postId)?postId:"00000000-0000-0000-0000-000000000000").eq("is_deleted",false).order("created_at",{ascending:true}).limit(100)
      ]);
      if(commentResult.error)throw commentResult.error;
      const data = commentResult.data;
      const authors=[...new Set((data||[]).map(x=>x.author_id))]; const {data:profiles}=authors.length?await client.from("profiles").select("id,username,display_name,avatar_url").in("id",authors):{data:[]};
      const map=new Map((profiles||[]).map(p=>[p.id,p]));
      return res.status(200).json({comments:(data||[]).map(c=>({...c,author:map.get(c.author_id)||null}))});
    }

    if (action === "block") {
      const target = await getProfileByUsername(client, body.username);
      if (target.id === user.id) return fail(res, 400, "You cannot block your own account.");
      const { error } = await client.from("user_blocks").upsert({ blocker_id: user.id, blocked_id: target.id }, { onConflict: "blocker_id,blocked_id" });
      if (error) throw error;
      const { error: outgoingError } = await client.from("follows").delete().eq("follower_id", user.id).eq("following_id", target.id);
      if (outgoingError) throw outgoingError;
      const { error: incomingError } = await client.from("follows").delete().eq("follower_id", target.id).eq("following_id", user.id);
      if (incomingError) throw incomingError;
      return res.status(200).json({ blocked: true });
    }

    if (action === "unblock") {
      const target = await getProfileByUsername(client, body.username);
      const { error } = await client.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target.id);
      if (error) throw error;
      return res.status(200).json({ blocked: false });
    }

    if (action === "blocked-users") {
      const { data, error } = await client.from("user_blocks").select("created_at,profiles!user_blocks_blocked_id_fkey(id,username,display_name,avatar_url)").eq("blocker_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return res.status(200).json({ users: (data || []).map(row => ({ ...row.profiles, blocked_at: row.created_at })).filter(Boolean) });
    }

    if (action === "follow" || action === "unfollow" || action === "follow-decision") {
      const profile = await getProfileByUsername(client,body.username);
      if(profile.id===user.id)return fail(res,400,"You cannot follow yourself.");
      if(action==="unfollow"){
        const {error}=await client.from("follows").delete().eq("follower_id",user.id).eq("following_id",profile.id);if(error)throw error;
        return res.status(200).json({status:null});
      }
      if(action==="follow-decision"){
        if(profile.id!==user.id)return fail(res,403,"Only the account owner can manage follow requests.");
        const followId=String(body.followId||""); const status=body.accept===true?"active":"rejected";
        const {data,error}=await client.from("follows").update({status,accepted_at:status==="active"?new Date().toISOString():null}).eq("id",followId).eq("following_id",user.id).eq("status","pending").select("status").single();
        if(error)throw error; return res.status(200).json({status:data.status});
      }
      const visibility=profile.profile_visibility || (profile.is_private?"private":"public");
      const status=visibility==="public"?"active":"pending";
      const {data,error}=await client.from("follows").upsert({follower_id:user.id,following_id:profile.id,status,accepted_at:status==="active"?new Date().toISOString():null},{onConflict:"follower_id,following_id"}).select("status").single();
      if(error)throw error; return res.status(200).json({status:data.status});
    }

    if (action === "edit-post" || action === "delete-post") {
      const postId = String(body.postId || "");
      const { data: owned, error: ownedError } = await client.from("posts").select("id,author_id").eq("id", postId).eq("author_id", user.id).maybeSingle();
      if (ownedError) throw ownedError;
      if (!owned) return fail(res, 404, "Post not found or you do not own it.");
      if (action === "delete-post") {
        const { error } = await client.from("posts").update({ is_deleted: true, updated_at: new Date().toISOString() }).eq("id", postId);
        if (error) throw error;
        return res.status(200).json({ deleted: true });
      }
      const content = plainText(body.content, 3000);
      if (!content) return fail(res, 400, "Post content cannot be empty.");
      const { data, error } = await client.from("posts").update({ content, hashtags: require("../lib/social").parseTags(content), mentions: require("../lib/social").parseMentions(content), updated_at: new Date().toISOString(), edited_at: new Date().toISOString() }).eq("id", postId).select("*").single();
      if (error) throw error;
      return res.status(200).json({ post: data });
    }

    if (action === "repost" || action === "unrepost") {
      const post = await visiblePost(client, body.postId, user.id);
      await limitCheck;
      if (action === "unrepost") {
        const { error } = await client.from("reposts").delete().eq("user_id", user.id).eq("post_id", post.id);
        if (error) throw error;
        return res.status(200).json({ reposted: false });
      }
      const { error } = await client.from("reposts").upsert({ user_id: user.id, post_id: post.id }, { onConflict: "user_id,post_id", ignoreDuplicates: true });
      if (error) throw error;
      return res.status(200).json({ reposted: true });
    }

    if (action === "report") {
      const report=validateReport(body); let targetUserId=null;
      if(report.target_type==="user"){
        const username=plainText(body.targetUsername,24).replace(/^@/,"");
        if(!username)return fail(res,400,"Enter the username of the account you are reporting.");
        const p=await getProfileByUsername(client,username); if(p.id===user.id)return fail(res,400,"You cannot report your own account."); targetUserId=p.id;
      }
      const {data,error}=await client.from("reports").insert({...report,reporter_id:user.id,target_user_id:targetUserId}).select("id,status,created_at").single();
      if(error)throw error; return res.status(201).json({report:data});
    }

    if(action==="notifications"){
      const {data,error}=await client.from("notifications").select("id,type,post_id,comment_id,is_read,created_at,actor_id").eq("recipient_id",user.id).order("created_at",{ascending:false}).limit(50);
      if(error)throw error;
      const actorIds=[...new Set((data||[]).map(row=>row.actor_id).filter(Boolean))];
      const {data:actors}=actorIds.length?await client.from("profiles").select("id,username,display_name,avatar_url,is_verified").in("id",actorIds):{data:[]};
      const actorMap=new Map((actors||[]).map(actor=>[actor.id,actor]));
      return res.status(200).json({notifications:(data||[]).map(item=>({...item,actor:actorMap.get(item.actor_id)||null}))});
    }

    if(action==="admin-reports" || action==="moderate-report"){
      const isAdmin=user.app_metadata?.admin===true || user.app_metadata?.role==="admin";
      if(!isAdmin)return fail(res,403,"Only authorized moderators can access the moderation queue.");
      if(action==="admin-reports"){
        const {data,error}=await client.from("reports").select("id,reporter_id,target_type,target_id,target_user_id,category,details,evidence_url,status,moderator_notes,created_at,updated_at").order("created_at",{ascending:false}).limit(100);
        if(error)throw error;return res.status(200).json({reports:data||[]});
      }
      const status=["new","reviewing","resolved","dismissed"].includes(body.status)?body.status:null;
      if(!status)return fail(res,400,"Choose a valid report status.");
      const {data,error}=await client.from("reports").update({status,moderator_notes:plainText(body.moderatorNotes,1000),updated_at:new Date().toISOString()}).eq("id",String(body.reportId||"")).select("id,status,moderator_notes").single();
      if(error)throw error;return res.status(200).json({report:data});
    }

    if(action==="my-reports"){
      const {data,error}=await client.from("reports").select("id,target_type,target_id,category,details,status,created_at,updated_at").eq("reporter_id",user.id).order("created_at",{ascending:false}).limit(50);
      if(error)throw error;return res.status(200).json({reports:data||[]});
    }

    if(action==="preferences"){
      if(req.body.save){
        const {data:existing,error:existingError}=await client.from("profile_feed_preferences").select("profile_visibility,home_feed").eq("user_id",user.id).maybeSingle();
        if(existingError)throw existingError;
        const preferenceRow={user_id:user.id,home_feed:["overview","public_posts","following_posts","builds","opportunities"].includes(body.homeFeed)?body.homeFeed:(existing?.home_feed||"overview"),profile_visibility:["public","followers","private"].includes(body.profileVisibility)?body.profileVisibility:(existing?.profile_visibility||"public"),updated_at:new Date().toISOString()};
        const {data,error}=await client.from("profile_feed_preferences").upsert(preferenceRow,{onConflict:"user_id"}).select("*").single();
        if(error)throw error;return res.status(200).json({preferences:data});
      }
      const {data,error}=await client.from("profile_feed_preferences").select("*").eq("user_id",user.id).maybeSingle();if(error)throw error;
      return res.status(200).json({preferences:data||{home_feed:"overview",profile_visibility:"public"}});
    }

    if(action==="mark-read"){
      const ids=Array.isArray(body.ids)?body.ids.filter(x=>/^[0-9a-f-]{36}$/i.test(String(x))).slice(0,100):[];
      if(!ids.length)return res.status(200).json({updated:0});
      const {data,error}=await client.from("notifications").update({is_read:true}).eq("recipient_id",user.id).in("id",ids).select("id");if(error)throw error;return res.status(200).json({updated:(data||[]).length});
    }

    return fail(res,400,"Unknown community action.");
  } catch(error) {
    const status=Number(error.status)||500;
    if(status>=500)console.error("Social API error",error);
    return fail(res,status,status===500?"The community service had a problem. Please try again.":error.message||"Request could not be completed.");
  }
}
module.exports=handler;
