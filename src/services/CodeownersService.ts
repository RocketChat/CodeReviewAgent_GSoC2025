import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { GitHubAPIService } from './GitHubAPIService';
import { AppSettingsEnum } from '../config/settings';
import { CodeownersPersistence } from '../persistence/CodeownersPersistence';
import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';

export interface CodeownersEntry {
    pattern: string;
    owners: string[];
    matcher: (filePath: string) => boolean;
}

export interface CodeownersData {
    repoName: string;
    entries: CodeownersEntry[];
    lastUpdated: Date;
}

export class CodeownersService {
    private githubService: GitHubAPIService;
    
    constructor(private app: CodeReviewAgentApp) {
        this.githubService = new GitHubAPIService(app);
    }

    /**
     * Fetches and parses CODEOWNERS for a repository
     */
    async fetchCodeowners(owner: string, repo: string): Promise<CodeownersData | null> {
        try {
            // Try to find CODEOWNERS in standard locations
            const locations = ['.github/CODEOWNERS', 'docs/CODEOWNERS', 'CODEOWNERS'];
            let codeownersContent: string | null = null;
            
            for (const location of locations) {
                codeownersContent = await this.githubService.getFileContent(owner, repo, location, "develop");
                if (codeownersContent) {
                    this.app.getLogger().info(`Found CODEOWNERS at ${location} for ${owner}/${repo}`);
                    break;
                }
            }
            
            if (!codeownersContent) {
                this.app.getLogger().warn(`No CODEOWNERS file found for ${owner}/${repo}`);
                return null;
            }
            
            const entries = await this.parseCodeowners(codeownersContent, owner);
            
            return {
                repoName: repo,
                entries,
                lastUpdated: new Date()
            };
            
        } catch (error) {
            this.app.getLogger().error(`Failed to fetch CODEOWNERS for ${owner}/${repo}: ${error.message}`);
            return null;
        }
    }

    /**
     * Parses CODEOWNERS file content
     */
    private async parseCodeowners(content: string, owner: string): Promise<CodeownersEntry[]> {
        const lines = content.split(/\r\n|\r|\n/);
        const entries: CodeownersEntry[] = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }
            
            // Split by whitespace to get pattern and owners
            const parts = trimmedLine.split(/\s+/);
            if (parts.length < 2) {
                continue; // Invalid line
            }
            
            const pattern = parts[0];
            const rawOwners = parts.slice(1);
            
            // Expand team owners to individual users
            const expandedOwners = await this.expandOwners(rawOwners, owner);
            
            entries.push({
                pattern,
                owners: expandedOwners,
                matcher: this.createMatcher(pattern)
            });
        }
        
        // Reverse entries so last match wins (like original codeowners package)
        return entries.reverse();
    }

    /**
     * Expands team references to individual users
     */
    private async expandOwners(owners: string[], orgOwner: string): Promise<string[]> {
        const expandedOwners: string[] = [];
        
        for (const owner of owners) {
            if (owner.includes('/')) {
                // This is a team reference like @org/team-name
                try {
                    const teamSlug = owner.split('/')[1];
                    const members = await this.githubService.getTeamMembers(orgOwner, teamSlug);
                    expandedOwners.push(...members.map(member => `@${member.login}`));
                } catch (error) {
                    this.app.getLogger().warn(`Failed to expand team ${owner}: ${error.message}`);
                    expandedOwners.push(owner); // Keep original if expansion fails
                }
            } else {
                expandedOwners.push(owner);
            }
        }
        
        return expandedOwners;
    }

    /**
     * Creates a matcher function for gitignore-style patterns
     * Simplified implementation of gitignore pattern matching
     */
    private createMatcher(pattern: string): (filePath: string) => boolean {
        return (filePath: string): boolean => {
            // Normalize paths (remove leading ./)
            const normalizedPath = filePath.replace(/^\.\//, '');
            const normalizedPattern = pattern.replace(/^\.\//, '');
            
            // Handle different pattern types
            if (normalizedPattern === '*') {
                return true; // Matches everything
            }
            
            if (normalizedPattern.endsWith('/')) {
                // Directory pattern - matches if path starts with this directory
                const dirPattern = normalizedPattern.slice(0, -1);
                return normalizedPath.startsWith(dirPattern + '/') || normalizedPath === dirPattern;
            }
            
            if (normalizedPattern.includes('*')) {
                // Wildcard pattern
                return this.matchWildcard(normalizedPath, normalizedPattern);
            }
            
            if (normalizedPattern.startsWith('/')) {
                // Absolute path pattern
                const absPattern = normalizedPattern.slice(1);
                return normalizedPath === absPattern || normalizedPath.startsWith(absPattern + '/');
            }
            
            // Simple string matching
            return normalizedPath === normalizedPattern || 
                   normalizedPath.endsWith('/' + normalizedPattern) ||
                   normalizedPath.startsWith(normalizedPattern + '/');
        };
    }

    /**
     * Simplified wildcard matching
     */
    private matchWildcard(text: string, pattern: string): boolean {
        // Convert gitignore pattern to regex
        let regexPattern = pattern
            .replace(/\./g, '\\.')           // Escape dots
            .replace(/\*\*/g, '.*')          // ** matches any number of directories
            .replace(/\*/g, '[^/]*')         // * matches anything except directory separator
            .replace(/\?/g, '[^/]');         // ? matches single character except directory separator
        
        // Add anchors
        regexPattern = '^' + regexPattern + '$';
        
        try {
            const regex = new RegExp(regexPattern);
            return regex.test(text);
        } catch (error) {
            this.app.getLogger().warn(`Invalid regex pattern from ${pattern}: ${error.message}`);
            return false;
        }
    }

    /**
     * Gets owners for a specific file path
     */
    getOwners(codeownersData: CodeownersData, filePath: string): string[] {
        for (const entry of codeownersData.entries) {
            if (entry.matcher(filePath)) {
                return [...entry.owners]; // Return copy
            }
        }
        return [];
    }

    /**
     * Gets owners for multiple file paths, returns mapping
     */
    getOwnersForFiles(codeownersData: CodeownersData, filePaths: string[]): { [filePath: string]: string[] } {
        const result: { [filePath: string]: string[] } = {};
        
        for (const filePath of filePaths) {
            result[filePath] = this.getOwners(codeownersData, filePath);
        }
        
        return result;
    }

    /**
     * Gets all unique owners across all entries in a codeowners data
     */
    getAllOwners(codeownersData: CodeownersData): string[] {
        const allOwners = new Set<string>();
        
        for (const entry of codeownersData.entries) {
            for (const owner of entry.owners) {
                allOwners.add(owner);
            }
        }
        
        return Array.from(allOwners);
    }

    /**
     * Get codeowners data for a repository from persistence
     */
    public async getCodeownersForRepo(repoName: string, persistenceRead: IPersistenceRead): Promise<any | null> {
        try {
            return await CodeownersPersistence.getCodeowners(repoName, persistenceRead);
        } catch (error) {
            this.app.getLogger().error(`Failed to get codeowners for ${repoName}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get owners for a specific file path using stored codeowners data
     */
    public async getOwnersForPath(persistenceRead: IPersistenceRead, repoName: string, filePath: string): Promise<string[]> {
        try {
            const codeownersData = await this.getCodeownersForRepo(repoName, persistenceRead);
            
            if (!codeownersData || !codeownersData.entries) {
                return [];
            }
            
            // Find owners using the stored patterns
            return this.getOwnersForFile(filePath, codeownersData.entries);
        } catch (error) {
            this.app.getLogger().error(`Failed to get owners for ${filePath} in ${repoName}: ${error.message}`);
            return [];
        }
    }

    /**
     * Helper to get owners for a specific file using CODEOWNERS patterns
     */
    private getOwnersForFile(filePath: string, entries: any[]): string[] {
        const owners: string[] = [];
        
        // Iterate through entries in reverse order (last match wins)
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            
            // Check if pattern matches the file path
            if (this.doesPatternMatch(entry.pattern, filePath)) {
                owners.push(...entry.owners);
                break; // Last matching pattern wins
            }
        }
        
        return owners;
    }
    /**
     * Simple pattern matching for CODEOWNERS patterns
     * This is a simplified version - for production, you might want a more robust implementation
     */
    private doesPatternMatch(pattern: string, filePath: string): boolean {
        // Convert CODEOWNERS pattern to regex-like matching
        
        // Handle exact paths
        if (pattern === filePath) {
            return true;
        }
        
        // Handle directory patterns (ending with /)
        if (pattern.endsWith('/')) {
            return filePath.startsWith(pattern) || filePath.startsWith(pattern.slice(0, -1) + '/');
        }
        
        // Handle wildcard patterns
        if (pattern.includes('*')) {
            const regexPattern = pattern
                .replace(/\./g, '\\.')  // Escape dots
                .replace(/\*/g, '.*');  // Convert * to .*
            
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(filePath);
        }
        
        // Handle extension patterns (*.js, *.ts, etc.)
        if (pattern.startsWith('*.')) {
            const extension = pattern.slice(1); // Remove the *
            return filePath.endsWith(extension);
        }
        
        // Handle glob patterns with more complex rules
        if (pattern.includes('**')) {
            // **/ means any subdirectory
            const parts = pattern.split('**/');
            if (parts.length === 2) {
                const prefix = parts[0];
                const suffix = parts[1];
                
                if (prefix && !filePath.startsWith(prefix)) {
                    return false;
                }
                
                if (suffix && !filePath.includes('/' + suffix) && !filePath.endsWith(suffix)) {
                    return false;
                }
                
                return true;
            }
        }
        
        // Default: check if file path starts with pattern (for directory matching)
        return filePath.startsWith(pattern + '/') || filePath === pattern;
    }

    /**
     * Sync all repositories and store codeowners data
     */
    public async syncAllRepositories(persistence: IPersistence): Promise<{ [repoName: string]: CodeownersData | null }> {
        try {
            const settings = this.app.getAccessors().environmentReader.getSettings();
            const repositoriesList = await settings.getValueById(AppSettingsEnum.REPOSITORIES_LIST_ID);
            const ownerName = await settings.getValueById(AppSettingsEnum.OWNER_NAME_ID);
            
            if (!repositoriesList || !ownerName) {
                throw new Error('Repository list or owner name not configured');
            }
            
            const repositories = repositoriesList.split(',').map(repo => repo.trim()).filter(Boolean);
            const results: { [repoName: string]: CodeownersData | null } = {};
            
            for (const repo of repositories) {
                try {
                    this.app.getLogger().info(`Syncing CODEOWNERS for ${repo}`);
                    const codeownersData = await this.fetchCodeowners(ownerName, repo);
                    results[repo] = codeownersData;
                    
                    if (codeownersData) {
                        // Store in persistence
                        await CodeownersPersistence.saveCodeowners(repo, {
                            repoName: codeownersData.repoName,
                            entries: codeownersData.entries.map(entry => ({
                                pattern: entry.pattern,
                                owners: entry.owners
                            })),
                            lastUpdated: codeownersData.lastUpdated
                        }, persistence);
                        
                        this.app.getLogger().info(`Successfully synced CODEOWNERS for ${repo}`);
                    } else {
                        this.app.getLogger().warn(`No CODEOWNERS found for ${repo}`);
                    }
                } catch (error) {
                    this.app.getLogger().error(`Failed to sync CODEOWNERS for ${repo}: ${error.message}`);
                    results[repo] = null;
                }
            }
            
            return results;
        } catch (error) {
            this.app.getLogger().error(`Failed to sync repositories: ${error.message}`);
            throw error;
        }
    }
}