export class ErrorHelper {
    static isRateLimitError(error: Error): boolean {
        return error.message.includes('Rate limit') || 
               error.message.includes('rate limit') ||
               error.message.includes('403');
    }

    static isNetworkError(error: Error): boolean {
        return error.message.includes('timeout') ||
               error.message.includes('ECONNRESET') ||
               error.message.includes('ENOTFOUND') ||
               error.message.includes('502') ||
               error.message.includes('503') ||
               error.message.includes('504');
    }

    static isAuthError(error: Error): boolean {
        return error.message.includes('401') ||
               error.message.includes('unauthorized') ||
               error.message.includes('Unauthorized');
    }

    static formatErrorForUser(error: Error): string {
        if (this.isRateLimitError(error)) {
            return 'GitHub API rate limit exceeded. Please try again later.';
        }
        
        if (this.isNetworkError(error)) {
            return 'Network error occurred. Please check your connection and try again.';
        }
        
        if (this.isAuthError(error)) {
            return 'Authentication failed. Please check your GitHub token configuration.';
        }
        
        return 'An unexpected error occurred. Please try again later.';
    }
}