'use client';

import React, { useState } from 'react';
import { Avatar, Card, Input, Table, Tag, Tooltip, Spin, Alert, Statistic, message, Typography } from 'antd';
import { GithubOutlined, StarOutlined, ForkOutlined, UserOutlined } from '@ant-design/icons';
const { Title, Paragraph } = Typography;

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
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await analyzeRepository();
  };

  const analyzeRepository = async () => {
    console.log('Analyzing repository');
    setLoading(true);
    setError('');
    setInfluencers([]);
    setRepoInfo(null);
    
    console.log('Submitting form with repo URL:', repoUrl);
    message.info('Analyzing repository...');

    try {
      console.log('Sending POST request to /api/github-influencers');
      const response = await fetch('/api/github-influencers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      });

      console.log('API response status:', response.status);
      console.log('API response headers:', response.headers);

      const responseText = await response.text();
      console.log('API response text:', responseText);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, message: ${responseText}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        throw new Error('Invalid JSON response from server');
      }

      console.log('Received data:', data);

      if (!data.influencers || !data.repoInfo) {
        throw new Error('Invalid data structure received from server');
      }

      setInfluencers(data.influencers);
      setRepoInfo(data.repoInfo);
      message.success('Analysis complete!');
    } catch (err: unknown) {
      console.error('Error during API call:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred. Please try again.');
      message.error('Failed to analyze repository. Please try again.');
    } finally {
      setLoading(false);
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
      sorter: (a: Influencer, b: Influencer) => a.score - b.score,
      render: (score: number) => <Tag color="blue">{score.toFixed(2)}</Tag>,
    },
    {
      title: 'Stats',
      key: 'stats',
      render: (record: Influencer) => (
        <div>
          <Tooltip title="Stars">
            <Tag icon={<StarOutlined />} color="gold">{record.stars}</Tag>
          </Tooltip>
          <Tooltip title="Followers">
            <Tag icon={<UserOutlined />} color="green">{record.followers}</Tag>
          </Tooltip>
          <Tooltip title="Contributions">
            <Tag icon={<GithubOutlined />} color="purple">{record.contributions}</Tag>
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
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col items-center justify-center">
      <Card className="w-full max-w-4xl" title="Most Influential GitHub Repo Stars">
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

        {error && <Alert message={error} type="error" showIcon className="mb-4" />}

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

        {loading ? (
          <div className="text-center">
            <Spin size="large" />
            <p className="mt-2">Analyzing influential stars...</p>
          </div>
        ) : influencers.length > 0 ? (
          <>
            <Typography className="mb-4">
              <Title level={4} className="text-center">
                Most Influential GitHub Users
              </Title>
              <Paragraph className="text-center">
                Here are the most influential GitHub users who have either starred or forked the selected repo,
                ranked by their followers and earned stars:
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
        ) : null}
      </Card>
    </div>
  );
}