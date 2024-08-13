import { Octokit } from "@octokit/rest";
import { NextResponse } from 'next/server';
import NodeCache from "node-cache";

const MAX_USERS_TO_PROCESS = 200;
const CONCURRENCY_LIMIT = 10;
const CACHE_TTL = 3600; // Cache for 1 hour

const cache = new NodeCache({ stdTTL: CACHE_TTL });

export async function POST(request) {
  console.log('Received POST request to /api/github-influencers');

  try {
    const body = await request.json();
    console.log('Request body:', body);

    const { repoUrl } = body;
    console.log('Repo URL:', repoUrl);

    if (!repoUrl) {
      console.error('Repository URL is missing');
      return NextResponse.json({ message: 'Repository URL is required' }, { status: 400 });
    }

    const urlParts = repoUrl.split('/');
    const owner = urlParts[urlParts.length - 2];
    const repo = urlParts[urlParts.length - 1];

    if (!owner || !repo) {
      console.error('Invalid repository URL:', repoUrl);
      return NextResponse.json({ message: 'Invalid repository URL' }, { status: 400 });
    }

    console.log('Processing repository:', owner, repo);

    const cacheKey = `${owner}/${repo}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      console.log('Returning cached result for', cacheKey);
      return NextResponse.json(cachedResult);
    }

    if (!process.env.GITHUB_API_KEY) {
      console.error('GitHub API key is missing');
      return NextResponse.json({ message: 'GitHub API key is not configured' }, { status: 500 });
    }

    const octokit = new Octokit({ 
      auth: process.env.GITHUB_API_KEY,
    });

    console.log('Fetching repository information');
    const repoInfo = await octokit.repos.get({ owner, repo });
    console.log('Repository information fetched:', repoInfo.data.name);
    console.log('Stars count from repo info:', repoInfo.data.stargazers_count);

    console.log('Fetching stargazers and forks');
    const [stargazers, forks] = await Promise.all([
      fetchStargazers(octokit, owner, repo),
      fetchAllPages(octokit, octokit.rest.repos.listForks, { owner, repo }),
    ]);

    console.log(`Found ${stargazers.length} stargazers and ${forks.length} forks`);

    const uniqueUsers = [...new Set([...stargazers.map(u => u.login), ...forks.map(f => f.owner.login)])];
    const usersToProcess = uniqueUsers.slice(0, MAX_USERS_TO_PROCESS);

    console.log(`Processing ${usersToProcess.length} unique users`);

    const userDetails = [];
    for (let i = 0; i < usersToProcess.length; i += CONCURRENCY_LIMIT) {
      const batch = usersToProcess.slice(i, i + CONCURRENCY_LIMIT);
      console.log(`Processing batch ${i / CONCURRENCY_LIMIT + 1} of ${Math.ceil(usersToProcess.length / CONCURRENCY_LIMIT)}`);
      const batchDetails = await Promise.all(batch.map(login => processUser(login, octokit)));
      userDetails.push(...batchDetails.filter(Boolean));
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
    cache.set(cacheKey, result);

    console.log('Returning result');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ message: 'An error occurred while processing the request', error: error.message }, { status: 500 });
  }
}

async function fetchStargazers(octokit, owner, repo) {
  console.log(`Fetching stargazers for ${owner}/${repo}`);
  try {
    const options = octokit.rest.activity.listStargazersForRepo.endpoint.merge({ owner, repo, per_page: 100 });
    const stargazers = await octokit.paginate(options);
    console.log(`Fetched ${stargazers.length} stargazers`);
    return stargazers;
  } catch (error) {
    console.error(`Error fetching stargazers for ${owner}/${repo}:`, error);
    throw error;
  }
}

async function fetchAllPages(octokit, method, params) {
  console.log(`Fetching all pages for ${method.endpoint.DEFAULTS.url}`);
  try {
    const options = method.endpoint.merge(params);
    const pages = await octokit.paginate(options);
    console.log(`Fetched ${pages.length} items`);
    return pages;
  } catch (error) {
    console.error(`Error fetching pages for ${method.endpoint.DEFAULTS.url}:`, error);
    throw error;
  }
}

async function processUser(login, octokit) {
  console.log(`Processing user: ${login}`);
  try {
    const [user, repos, events] = await Promise.all([
      octokit.rest.users.getByUsername({ username: login }),
      octokit.rest.repos.listForUser({ username: login, sort: 'stars', direction: 'desc', per_page: 100 }),
      octokit.rest.activity.listPublicEventsForUser({ username: login, per_page: 100 }),
    ]);

    const totalStars = repos.data.reduce((sum, repo) => sum + repo.stargazers_count, 0);
    const contributions = user.data.public_repos + user.data.public_gists;
    const recentActivity = events.data.length;

    console.log(`Processed user ${login}: ${totalStars} stars, ${contributions} contributions, ${recentActivity} recent activities`);

    return {
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
  } catch (error) {
    console.error(`Error processing user ${login}:`, error);
    return null;
  }
}

function calculateScore(stars, followers, contributions, recentActivity) {
  return stars * 1.5 + followers * 2 + contributions * 0.5 + recentActivity * 0.1;
}