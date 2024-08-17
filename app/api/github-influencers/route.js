import { Octokit } from "@octokit/rest";
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const MAX_USERS_TO_PROCESS = 1000;
const CONCURRENCY_LIMIT = 30;
const CACHE_TTL = 100*7200000; // 200 hours in milliseconds
const RATE_LIMIT_DELAY = 15000; // 15 second delay for rate limiting

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'github_cache.sqlite'));

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS repo_cache (
    repo_id TEXT PRIMARY KEY,
    data TEXT,
    timestamp INTEGER
  );
  CREATE TABLE IF NOT EXISTS user_cache (
    login TEXT PRIMARY KEY,
    data TEXT,
    timestamp INTEGER
  );
`);

export async function POST(request) {
  console.log('Received POST request to /api/github-influencers');

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendUpdate = async (message, progress = 0) => {
    try {
      await writer.write(encoder.encode(JSON.stringify({ status: message, progress }) + '\n'));
    } catch (error) {
      console.error('Error sending update:', error);
      throw new Error('Stream closed');
    }
  };

  const response = new Response(stream.readable, {
    headers: { 'Content-Type': 'application/json' },
  });

  (async () => {
    try {
      const body = await request.json();
      const userApiKey = request.headers.get('X-GitHub-Api-Key');
      const apiKey = userApiKey || process.env.GITHUB_API_KEY;

      if (!apiKey) {
        await sendUpdate('GitHub API key is required', 100);
        return;
      }

      console.log('Request body:', body);

      const { repoUrl } = body;
      console.log('Repo URL:', repoUrl);

      // Remove trailing slash if present
      if (repoUrl.endsWith('/')) {
        repoUrl = repoUrl.slice(0, -1);
      }
      
      if (!repoUrl) {
        console.error('Repository URL is missing');
        await sendUpdate('Repository URL is required', 100);
        return;
      }

      const urlParts = repoUrl.split('/');
      const owner = urlParts[urlParts.length - 2];
      const repo = urlParts[urlParts.length - 1];

      if (!owner || !repo) {
        console.error('Invalid repository URL:', repoUrl);
        await sendUpdate('Invalid repository URL', 100);
        return;
      }

      console.log('Processing repository:', owner, repo);

      const cacheKey = `${owner}/${repo}`;
      const cachedResult = getCachedRepo(cacheKey);
      if (cachedResult) {
        console.log('Returning cached result for', cacheKey);
        await sendUpdate('Retrieving cached result', 50);
        await writer.write(encoder.encode(JSON.stringify(cachedResult) + '\n'));
        await sendUpdate('Analysis complete (cached)', 100);
        return;
      }

      const octokit = new Octokit({ 
        auth: apiKey,
      });

      await sendUpdate('Fetching repository information', 10);
      console.log('Fetching repository information');
      const repoInfo = await fetchWithRateLimitHandling(() => octokit.repos.get({ owner, repo }), sendUpdate);
      console.log('Repository information fetched:', repoInfo.data.name);
      console.log('Stars count from repo info:', repoInfo.data.stargazers_count);

      await sendUpdate('Fetching stargazers and forks', 20);
      console.log('Fetching stargazers and forks');
      const [stargazers, forks] = await Promise.all([
        fetchStargazers(octokit, owner, repo, sendUpdate),
        fetchAllPages(octokit, octokit.rest.repos.listForks, { owner, repo }, sendUpdate),
      ]);

      console.log(`Found ${stargazers.length} stargazers and ${forks.length} forks`);

      const uniqueUsers = [...new Set([...stargazers.map(u => u.login), ...forks.map(f => f.owner.login)])];
      const usersToProcess = uniqueUsers.slice(0, MAX_USERS_TO_PROCESS);

      console.log(`Processing ${usersToProcess.length} unique users`);

      const userDetails = [];
      for (let i = 0; i < usersToProcess.length; i += CONCURRENCY_LIMIT) {
        const batch = usersToProcess.slice(i, i + CONCURRENCY_LIMIT);
        console.log(`Processing batch ${i / CONCURRENCY_LIMIT + 1} of ${Math.ceil(usersToProcess.length / CONCURRENCY_LIMIT)}`);
        const progress = 30 + (i / usersToProcess.length) * 60;
        await sendUpdate(`Processing users ${i + 1} to ${Math.min(i + CONCURRENCY_LIMIT, usersToProcess.length)}`, progress);
        const batchDetails = await Promise.all(batch.map(login => processUser(login, octokit, sendUpdate)));
        userDetails.push(...batchDetails.filter(Boolean));
        
        // Add a small delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      userDetails.sort((a, b) => b.score - a.score);

      const result = {
        repoInfo: {
          name: repoInfo.data.name,
          description: repoInfo.data.description,
          stars: repoInfo.data.stargazers_count,
          forks: repoInfo.data.forks_count,
        },
        influencers: userDetails,
      };

      console.log('Caching result');
      cacheRepo(cacheKey, result);

      console.log('Returning result');
      await sendUpdate('Analysis complete', 100);
      await writer.write(encoder.encode(JSON.stringify(result) + '\n'));
    } catch (error) {
      if (error.message === 'Stream closed') {
        console.log('Client disconnected, stopping processing');
      } else {
        console.error('Error processing request:', error);
        try {
          await sendUpdate(`Error: ${error.message}`, 100);
        } catch (sendError) {
          console.error('Error sending error update:', sendError);
        }
      }
    } finally {
      try {
        await writer.close();
      } catch (closeError) {
        console.error('Error closing writer:', closeError);
      }
    }
  })();

  return response;
}

function getCachedRepo(repoId) {
  const now = Date.now();
  const stmt = db.prepare('SELECT data, timestamp FROM repo_cache WHERE repo_id = ?');
  const result = stmt.get(repoId);
  if (result && (now - result.timestamp) < CACHE_TTL) {
    return JSON.parse(result.data);
  }
  return null;
}

function cacheRepo(repoId, data) {
  const stmt = db.prepare('INSERT OR REPLACE INTO repo_cache (repo_id, data, timestamp) VALUES (?, ?, ?)');
  stmt.run(repoId, JSON.stringify(data), Date.now());
}

function getCachedUser(login) {
  const now = Date.now();
  const stmt = db.prepare('SELECT data, timestamp FROM user_cache WHERE login = ?');
  const result = stmt.get(login);
  if (result && (now - result.timestamp) < CACHE_TTL) {
    return JSON.parse(result.data);
  }
  return null;
}

function cacheUser(login, data) {
  const stmt = db.prepare('INSERT OR REPLACE INTO user_cache (login, data, timestamp) VALUES (?, ?, ?)');
  stmt.run(login, JSON.stringify(data), Date.now());
}

async function fetchWithRateLimitHandling(fetchFunction, sendUpdate, maxRetries = 25) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFunction();
    } catch (error) {
      if (error.status === 403 && error.message.includes('rate limit')) {
        const waitTime = RATE_LIMIT_DELAY / 1000;
        console.log(`Rate limit exceeded. Waiting for ${waitTime} seconds before retrying...`);
        await sendUpdate(`Rate limit reached. Waiting for ${waitTime} seconds...`, -1);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries reached for rate limit');
}

async function fetchStargazers(octokit, owner, repo, sendUpdate) {
  console.log(`Fetching stargazers for ${owner}/${repo}`);
  try {
    const options = octokit.rest.activity.listStargazersForRepo.endpoint.merge({ owner, repo, per_page: 100 });
    const stargazers = await fetchWithRateLimitHandling(() => octokit.paginate(options), sendUpdate);
    console.log(`Fetched ${stargazers.length} stargazers`);
    return stargazers;
  } catch (error) {
    console.error(`Error fetching stargazers for ${owner}/${repo}:`, error);
    throw error;
  }
}

async function fetchAllPages(octokit, method, params, sendUpdate) {
  console.log(`Fetching all pages for ${method.endpoint.DEFAULTS.url}`);
  try {
    const options = method.endpoint.merge(params);
    const pages = await fetchWithRateLimitHandling(() => octokit.paginate(options), sendUpdate);
    console.log(`Fetched ${pages.length} items`);
    return pages;
  } catch (error) {
    console.error(`Error fetching pages for ${method.endpoint.DEFAULTS.url}:`, error);
    throw error;
  }
}

async function processUser(login, octokit, sendUpdate) {
  console.log(`Processing user: ${login}`);
  const cachedUser = getCachedUser(login);
  if (cachedUser) {
    console.log(`Returning cached data for user: ${login}`);
    return cachedUser;
  }

  try {
    const [user, repos, events] = await Promise.all([
      fetchWithRateLimitHandling(() => octokit.rest.users.getByUsername({ username: login }), sendUpdate),
      fetchWithRateLimitHandling(() => octokit.rest.repos.listForUser({ username: login, sort: 'stars', direction: 'desc', per_page: 100 }), sendUpdate),
      fetchWithRateLimitHandling(() => octokit.rest.activity.listPublicEventsForUser({ username: login, per_page: 100 }), sendUpdate),
    ]);

    const totalStars = repos.data.reduce((sum, repo) => sum + repo.stargazers_count, 0);
    const contributions = user.data.public_repos + user.data.public_gists;
    const recentActivity = events.data.length;

    console.log(`Processed user ${login}: ${totalStars} stars, ${contributions} contributions, ${recentActivity} recent activities`);

    const userData = {
      login,
      name: user.data.name || login,
      avatarUrl: user.data.avatar_url,
      bio: user.data.bio,
      company: user.data.company,
      location: user.data.location,
      stars: totalStars,
      followers: user.data.followers,
      following: user.data.following,
      contributions,
      recentActivity,
      score: calculateScore(totalStars, user.data.followers, contributions, recentActivity),
    };

    cacheUser(login, userData);
    return userData;
  } catch (error) {
    console.error(`Error processing user ${login}:`, error);
    return null;
  }
}

function calculateScore(stars, followers, contributions, recentActivity) {
  return stars * 2.5 + followers * 2.0 + contributions * 0.1 + recentActivity * 0.1;
}
