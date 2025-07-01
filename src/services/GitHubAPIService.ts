import { IHttp, IHttpResponse } from '@rocket.chat/apps-engine/definition/accessors';
import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AppSettingsEnum } from '../config/settings';

export interface GitHubPullRequest {
    id: number;
    number: number;
    title: string;
    body: string;
    state: string;
    created_at: string;
    updated_at: string;
    user: {
        login: string;
        id: number;
        created_at: string;
        public_repos: number;
        followers: number;
    };
    head: {
        sha: string;
    };
    base: {
        sha: string;
    };
}

export interface GitHubFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
}

export interface GitHubCommit {
    sha: string;
    commit: {
        author: {
            name: string;
            email: string;
            date: string;
        };
        message: string;
    };
    author: {
        login: string;
        id: number;
    } | null;
}

export interface GitHubTeamMember {
    login: string;
    id: number;
    type: string;
}

export class GitHubAPIService {
    private baseUrl = 'https://api.github.com';
    private retryDelays = [1000, 2000, 4000]; // ms
    
    constructor(private app: CodeReviewAgentApp) {}

    private async getAuthHeaders(): Promise<{ [key: string]: string }> {
        const token = await this.app.getAccessors().environmentReader
            .getSettings().getValueById(AppSettingsEnum.ORG_ADMIN_PAT_TOKEN_ID);
        
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'RocketChat-CodeReviewAgent/1.0'
        };
    }

    private async makeRequest<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        url: string,
        data?: any,
        attempt = 1
    ): Promise<T> {
        const headers = await this.getAuthHeaders();
        const httpClient = this.app.getAccessors().http;
        
        try {
            let response: IHttpResponse;
            
            switch (method) {
                case 'GET':
                    response = await httpClient.get(url, { headers });
                    break;
                case 'POST':
                    response = await httpClient.post(url, { headers, data });
                    break;
                case 'PUT':
                    response = await httpClient.put(url, { headers, data });
                    break;
                case 'DELETE':
                    response = await httpClient.del(url, { headers });
                    break;
                default:
                    throw new Error(`Unsupported HTTP method: ${method}`);
            }

            if (response.statusCode === 403 && response.headers!['x-ratelimit-remaining'] === '0') {
                const resetTime = parseInt(response.headers!['x-ratelimit-reset'] || '0') * 1000;
                const waitTime = Math.max(resetTime - Date.now(), 60000); // At least 1 minute
                throw new Error(`Rate limit exceeded. Reset at: ${new Date(resetTime).toISOString()}`);
            }

            if (response.statusCode >= 200 && response.statusCode < 300) {
                return response.data as T;
            }

            throw new Error(`GitHub API error: ${response.statusCode} - ${response.content}`);
            
        } catch (error) {
            const shouldRetry = attempt <= this.retryDelays.length && 
                              (error.message.includes('Rate limit') || 
                               error.message.includes('timeout') ||
                               error.message.includes('502') ||
                               error.message.includes('503'));
            
            if (shouldRetry) {
                const delay = this.retryDelays[attempt - 1];
                this.app.getLogger().warn(`Request failed, retrying in ${delay}ms: ${error.message}`);
                await this.sleep(delay);
                return this.makeRequest<T>(method, url, data, attempt + 1);
            }
            
            this.app.getLogger().error(`GitHub API request failed: ${error.message}`);
            throw error;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Pull Requests
    async getPullRequests(owner: string, repo: string, since?: Date): Promise<GitHubPullRequest[]> {
        let url = `${this.baseUrl}/repos/${owner}/${repo}/pulls?state=open&sort=created&direction=desc`;
        
        if (since) {
            url += `&since=${since.toISOString()}`;
        }
        
        return this.makeRequest<GitHubPullRequest[]>('GET', url);
    }

    async getPullRequestFiles(owner: string, repo: string, prNumber: number): Promise<GitHubFile[]> {
        const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/files`;
        return this.makeRequest<GitHubFile[]>('GET', url);
    }

    async getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string> {
        const headers = await this.getAuthHeaders();
        headers['Accept'] = 'application/vnd.github.diff';
        
        const response = await this.app.getAccessors().http.get(
            `${this.baseUrl}/repos/${owner}/${repo}/pulls/${prNumber}`,
            { headers }
        );
        
        if (response.statusCode !== 200) {
            throw new Error(`Failed to get PR diff: ${response.statusCode}`);
        }
        
        return response.content || '';
    }

    // Repository Content
    async getFileContent(owner: string, repo: string, path: string, ref = 'main'): Promise<string | null> {
        try {
            const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
            const response = await this.makeRequest<{ content: string; encoding: string }>('GET', url);
            
            if (response.encoding === 'base64') {
                return Buffer.from(response.content, 'base64').toString('utf-8');
            }
            return response.content;
        } catch (error) {
            if (error.message.includes('404')) {
                return null; // File doesn't exist
            }
            throw error;
        }
    }

    // Commit History
    async getCommitHistory(owner: string, repo: string, path: string, since?: Date): Promise<GitHubCommit[]> {
        let url = `${this.baseUrl}/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}`;
        
        if (since) {
            url += `&since=${since.toISOString()}`;
        }
        
        return this.makeRequest<GitHubCommit[]>('GET', url);
    }

    // Teams
    async getTeamMembers(org: string, teamSlug: string): Promise<GitHubTeamMember[]> {
        const url = `${this.baseUrl}/orgs/${org}/teams/${teamSlug}/members`;
        return this.makeRequest<GitHubTeamMember[]>('GET', url);
    }

    // User Info
    async getUserInfo(username: string): Promise<any> {
        const url = `${this.baseUrl}/users/${username}`;
        return this.makeRequest<any>('GET', url);
    }

    // Repository Info
    async getRepository(owner: string, repo: string): Promise<any> {
        const url = `${this.baseUrl}/repos/${owner}/${repo}`;
        return this.makeRequest<any>('GET', url);
    }
}