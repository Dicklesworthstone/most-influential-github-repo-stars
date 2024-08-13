# Most Influential GitHub Repo Stars

## Overview

This project is an open-source tool that analyzes the influence of users who have starred or forked a given GitHub repository. It provides insights into the "importance" of these users based on their GitHub activity and follower count, helping repository owners understand the reach and impact of their projects.

| ![Screenshot 1](https://raw.githubusercontent.com/Dicklesworthstone/most-influential-github-repo-stars/main/screenshot_1.webp) | ![Screenshot 2](https://raw.githubusercontent.com/Dicklesworthstone/most-influential-github-repo-stars/main/screenshot_2.webp) |
|:--:|:--:|
| *Enter a Repo URL to Start Getting the Data* | *After Completing the Analysis, View the Results* |

## Features

- Analyzes stargazers and forkers of a specified GitHub repository
- Calculates an "influencer importance score" for each user
- Displays detailed user information including total stars, followers, and recent activity
- Implements intelligent caching using SQLite to improve performance and reduce API calls
- Handles GitHub API rate limiting gracefully
- Allows users to securely use their own GitHub API keys
- Provides a responsive web interface with real-time progress updates

## How It Works

1. **Data Collection**: The application fetches stargazers and forkers of the specified repository using the GitHub API.
2. **User Analysis**: For each unique user, it retrieves additional information such as their repositories, followers, and recent activity.
3. **Score Calculation**: An "influencer importance score" is calculated based on the user's total stars, followers, contributions, and recent activity.
4. **Result Presentation**: Users are ranked by their score, and the results are displayed in a user-friendly table format.

## Technical Details

### Backend (Node.js with Next.js API Routes)

The backend is implemented using Next.js API routes and utilizes the following key libraries:

- `@octokit/rest`: For interacting with the GitHub API
- `better-sqlite3`: For efficient local caching of API responses

Key features of the backend include:

1. **Efficient API Usage**:
   - Implements concurrent processing of user data with a configurable concurrency limit
   - Utilizes GitHub API pagination to handle large datasets

2. **Intelligent Caching**:
   - Uses SQLite to cache repository and user data
   - Implements a time-based cache invalidation strategy (default TTL: 20 hours)

3. **Rate Limit Handling**:
   - Implements exponential backoff when hitting rate limits
   - Provides real-time status updates to the frontend during rate limit waits

4. **Streaming Response**:
   - Utilizes a streaming response to provide real-time progress updates to the frontend

### Frontend (React with Next.js)

The frontend is built using React and Next.js, providing a responsive and interactive user interface. Key features include:

1. **Real-time Updates**: Displays progress and status messages during the analysis process
2. **Responsive Design**: Utilizes Ant Design components for a clean, modern UI that works well on various screen sizes
3. **User API Key Management**: Allows users to securely input and store their GitHub API key in the browser's local storage

## Setup and Usage

### Prerequisites

- Node.js (v14 or later recommended)
- npm or yarn
- A GitHub account and API key

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/Dicklesworthstone/most-influential-github-repo-stars.git
   cd most-influential-github-repo-stars
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory and add your GitHub API key:
   ```
   GITHUB_API_KEY=your_api_key_here
   ```

### Running the Application

1. Start the development server:
   ```
   npm run dev
   ```

2. Open your browser and navigate to `http://localhost:3000`

### Using the Application

1. Enter a GitHub repository URL in the input field
2. Click "Analyze" or press Enter
3. Wait for the analysis to complete (you'll see real-time progress updates)
4. View the results in the table below

## Generating a GitHub API Key

To use this application, you'll need a GitHub API key. Here's how to generate one using the `gh` CLI tool on Ubuntu:

1. Install the GitHub CLI:
   ```
   sudo apt update
   sudo apt install gh
   ```

2. Authenticate with your GitHub account:
   ```
   gh auth login
   ```
   Follow the prompts to complete the authentication process.

3. Generate a new API key:
   ```
   gh auth token
   ```
   This will create and display a new Personal Access Token.

4. Copy the generated token and use it in the application or set it as the `GITHUB_API_KEY` environment variable.

## Security Considerations

- The application allows users to input their own GitHub API keys. These keys are stored securely in the browser's local storage and are never sent to the server.
- Always use HTTPS in production to ensure secure transmission of API keys and other sensitive data.
- Be cautious when analyzing repositories you don't trust, as the application will execute code to process the repository data.

## Limitations and Future Improvements

- The application currently processes a maximum of 3000 users per repository to manage processing time and API usage.
- Future versions could implement more advanced caching strategies or database solutions for improved performance.
- Additional metrics could be incorporated into the influencer score calculation for more accurate results.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).