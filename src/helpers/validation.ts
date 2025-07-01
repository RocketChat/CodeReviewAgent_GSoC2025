export class ValidationHelper {
    static isValidGitHubUsername(username: string): boolean {
        // GitHub username rules: 
        // - May only contain alphanumeric characters or single hyphens
        // - Cannot begin or end with a hyphen
        // - Maximum 39 characters
        const regex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
        return regex.test(username);
    }

    static isValidRepositoryName(repoName: string): boolean {
        // GitHub repository name rules
        const regex = /^[a-zA-Z0-9._-]+$/;
        return regex.test(repoName) && repoName.length <= 100;
    }

    static isValidGitHubToken(token: string): boolean {
        // Basic GitHub token format validation
        // Classic tokens start with 'ghp_' (40 chars total)
        // Fine-grained tokens start with 'github_pat_' (longer)
        return (token.startsWith('ghp_') && token.length === 40) ||
               (token.startsWith('github_pat_') && token.length > 20);
    }

    static isValidApiKey(apiKey: string): boolean {
        // Basic API key validation - should be a non-empty string
        return typeof apiKey === 'string' && apiKey.trim().length > 0;
    }

    static sanitizeRepositoryList(repositoriesRaw: string): string[] {
        return repositoriesRaw
            .split('\n')
            .map(repo => repo.trim())
            .filter(repo => repo.length > 0)
            .filter(repo => this.isValidRepositoryName(repo));
    }
}