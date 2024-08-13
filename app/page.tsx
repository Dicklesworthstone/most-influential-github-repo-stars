'use client';

import React, { useState, useEffect } from 'react';
import { Avatar, Card, Input, Table, Tag, Tooltip, Spin, Alert, Statistic, message, Typography, Modal, Button, Progress, Select } from 'antd';
import { GithubOutlined, StarOutlined, ForkOutlined, UserOutlined, SettingOutlined } from '@ant-design/icons';
import '@fontsource/montserrat';  // Import Montserrat font
const { Title, Paragraph, Text, Link } = Typography;
const { Option } = Select;

interface Influencer {
  login: string;
  name: string;
  avatarUrl: string;
  bio: string;
  company: string;
  location: string;
  stars: number;
  followers: number;
  following: number;
  contributions: number;
  recentActivity: number;
  score: number;
}

interface RepoInfo {
  name: string;
  description: string;
  stars: number;
  forks: number;
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showApiKeyOption, setShowApiKeyOption] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [pastUrls, setPastUrls] = useState<string[]>([]);
  const pageSize = 10;

  useEffect(() => {
    const storedApiKey = localStorage.getItem('githubApiKey');
    if (storedApiKey) {
      setApiKey(storedApiKey);
    }

    const storedUrls = localStorage.getItem('pastUrls');
    if (storedUrls) {
      setPastUrls(JSON.parse(storedUrls));
    }
  }, []);

  const handleApiKeySubmit = () => {
    localStorage.setItem('githubApiKey', apiKey);
    setShowApiKeyModal(false);
    message.success('GitHub API key saved successfully');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updatePastUrls(repoUrl);
    await analyzeRepository();
  };

  const analyzeRepository = async () => {
    console.log('Analyzing repository');
    setLoading(true);
    setError('');
    setInfluencers([]);
    setRepoInfo(null);
    setProgress(0);
    setStatusMessage('Initializing analysis...');
    setRateLimitWarning(false);

    console.log('Submitting form with repo URL:', repoUrl);
    message.info('Analyzing repository...');

    try {
      console.log('Sending POST request to /api/github-influencers');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['X-GitHub-Api-Key'] = apiKey;
      }

      const response = await fetch('/api/github-influencers', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ repoUrl }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let partialData = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
      
        const chunk = decoder.decode(value, { stream: true });
        partialData += chunk;
      
        let boundaryIndex;
        while ((boundaryIndex = partialData.indexOf('\n')) >= 0) {
          const jsonString = partialData.slice(0, boundaryIndex);
          partialData = partialData.slice(boundaryIndex + 1);
      
          if (jsonString.trim() === '') continue;
      
          try {
            const data = JSON.parse(jsonString);
            if (data.status) {
              setStatusMessage(data.status);
              if (data.progress >= 0) {
                setProgress(Number(data.progress.toFixed(1)));
              } else {
                setRateLimitWarning(true);
              }
            } else if (data.repoInfo && data.influencers) {
              setRepoInfo(data.repoInfo);
              setInfluencers(data.influencers);
              message.success('Analysis complete!');
            }
          } catch (e) {
            console.error('Error parsing JSON:', e);
          }
        }
      }
      
    } catch (err: unknown) {
      console.error('Error during API call:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred. Please try again.');
      message.error('Failed to analyze repository. Please try again.');
    } finally {
      setLoading(false);
      setProgress(100);
      setStatusMessage('');
      setRateLimitWarning(false);
    }
  };

  const updatePastUrls = (url: string) => {
    if (!url) return;

    let updatedUrls = [...pastUrls];
    if (!updatedUrls.includes(url)) {
      updatedUrls = [url, ...updatedUrls].slice(0, 10); // Keep only the last 10 URLs
      setPastUrls(updatedUrls);
      localStorage.setItem('pastUrls', JSON.stringify(updatedUrls));
    }
  };

  const columns = [
    {
      title: 'User',
      dataIndex: 'login',
      key: 'login',
      render: (text: string, record: Influencer) => (
        <div className="flex items-center">
          <Avatar src={record.avatarUrl} size="large" />
          <div className="ml-2">
            <div>{record.name}</div>
            <div className="text-xs text-gray-500">{text}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Score',
      dataIndex: 'score',
      key: 'score',
      sorter: (a: Influencer, b: Influencer) => b.score - a.score,
      render: (score: number) => <Tag color="blue">{score.toLocaleString()}</Tag>,
    },
    {
      title: 'Stats',
      key: 'stats',
      render: (record: Influencer) => (
        <div>
          <Tooltip title="Stars">
            <Tag icon={<StarOutlined />} color="gold">{record.stars.toLocaleString()}</Tag>
          </Tooltip>
          <Tooltip title="Followers">
            <Tag icon={<UserOutlined />} color="green">{record.followers.toLocaleString()}</Tag>
          </Tooltip>
          <Tooltip title="Contributions">
            <Tag icon={<GithubOutlined />} color="purple">{record.contributions.toLocaleString()}</Tag>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Details',
      key: 'details',
      render: (record: Influencer) => (
        <Tooltip title={record.bio}>
          <div>{record.company}</div>
          <div className="text-xs text-gray-500">{record.location}</div>
        </Tooltip>
      ),
    },
  ];
  
  return (
    <div className="min-h-screen bg-gray-100 py-4 flex flex-col items-center justify-center">
      {/* Header Section */}
      <div className="w-full max-w-4xl mb-4">
        <Typography>
          <Text>
            Made by <Link href="https://github.com/Dicklesworthstone" target="_blank">Jeffrey Emanuel</Link>. See <Link href="https://github.com/Dicklesworthstone/most-influential-github-repo-stars" target="_blank">Source Code</Link>
          </Text>
        </Typography>
      </div>

      <Card className="w-full max-w-4xl" title={<Title level={2} className="text-4xl">Most Influential GitHub Repo Stars</Title>}>
        <form onSubmit={handleSubmit} className="mb-8">
          <Input.Search
            placeholder="Enter GitHub Repo URL"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onSearch={analyzeRepository}
            enterButton="Analyze"
            size="large"
            loading={loading}
          />
        </form>

        <div className="mb-4">
          <Button type="link" onClick={() => setShowApiKeyOption(!showApiKeyOption)}>
            Having trouble? Click here to use your own GitHub API Key
          </Button>
          {showApiKeyOption && (
            <div className="mt-2">
              <Text type="secondary">
                You can securely use your own GitHub API Key. It's never sent to our server and is kept securely in your own browser.
              </Text>
              <Button type="primary" icon={<SettingOutlined />} onClick={() => setShowApiKeyModal(true)} className="mt-2">
                Set GitHub API Key
              </Button>
            </div>
          )}
        </div>

        {error && <Alert message={error} type="error" showIcon className="mb-4" />}

        {loading && (
          <div className="text-center mb-4">
            <Spin size="large" />
            <Progress percent={progress} status="active" />
            <p className="mt-2">{statusMessage || 'Analyzing influential stars...'}</p>
            {rateLimitWarning && (
              <Alert message="Rate limit reached. Waiting before retrying..." type="warning" showIcon className="mt-2" />
            )}
          </div>
        )}

        {repoInfo && (
          <Card className="mb-4">
            <Statistic title="Repository" value={repoInfo.name} />
            <p>{repoInfo.description}</p>
            <div className="flex justify-around mt-4">
              <Statistic title="Stars" value={repoInfo.stars} prefix={<StarOutlined />} />
              <Statistic title="Forks" value={repoInfo.forks} prefix={<ForkOutlined />} />
            </div>
          </Card>
        )}

        {influencers.length > 0 && (
          <>
            <Typography className="mb-4">
              <Title level={4} className="text-center">
                Most Influential GitHub Users
              </Title>
              <Paragraph className="text-center">
                Here are the most influential GitHub users who have either starred or forked the selected repo,
                ranked by their score:
              </Paragraph>
            </Typography>
            <Table
              dataSource={influencers}
              columns={columns}
              rowKey="login"
              pagination={{
                current: page,
                pageSize: pageSize,
                total: influencers.length,
                onChange: (page) => setPage(page),
              }}
            />
          </>
        )}
      </Card>

      <Modal
        title="Set GitHub API Key"
        open={showApiKeyModal}
        onOk={handleApiKeySubmit}
        onCancel={() => setShowApiKeyModal(false)}
      >
        <Input.Password
          placeholder="Enter your GitHub API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="mt-2">Your API key will be stored securely in your browser and not sent to our servers.</p>
      </Modal>
    </div>
  );
}