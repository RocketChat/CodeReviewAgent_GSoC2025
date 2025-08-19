import { IHttp, IHttpResponse } from '@rocket.chat/apps-engine/definition/accessors';
import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AppSettingsEnum } from '../config/settings';

// OpenAI-compatible request/response interfaces
export interface ChatCompletionMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatCompletionMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
}

export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface AIAnalysisResult {
    success: boolean;
    result?: any;
    reasoning?: string;
    error?: string;
    tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export class AIService {
    constructor(private app: CodeReviewAgentApp) {}

    private async getApiConfig(): Promise<{ apiKey: string; baseUrl: string; model: string }> {
        const settings = this.app.getAccessors().environmentReader.getSettings();
        
        const apiKey = await settings.getValueById(AppSettingsEnum.AI_PROVIDER_API_KEY_ID);
        const baseUrl = await settings.getValueById(AppSettingsEnum.AI_PROVIDER_BASE_URL_ID);
        const model = await settings.getValueById(AppSettingsEnum.AI_MODEL_ID);
        
        if (!apiKey) {
            throw new Error('AI provider API key not configured');
        }
        
        if (!baseUrl) {
            throw new Error('AI provider base URL not configured');
        }
        
        return { apiKey, baseUrl, model };
    }

    public async makeAIRequest(
        prompt: string, 
        systemInstruction?: string,
        config?: {
            temperature?: number;
            maxTokens?: number;
            topP?: number;
        }
    ): Promise<AIAnalysisResult> {
        try {
            const { apiKey, baseUrl, model } = await this.getApiConfig();
            const httpClient = this.app.getAccessors().http;
            
            // Build messages array in OpenAI format
            const messages: ChatCompletionMessage[] = [];
            
            if (systemInstruction) {
                messages.push({
                    role: 'system',
                    content: systemInstruction
                });
            }
            
            messages.push({
                role: 'user',
                content: prompt
            });

            const requestBody: ChatCompletionRequest = {
                model,
                messages,
                temperature: config?.temperature ?? 0.7,
                max_tokens: config?.maxTokens ?? 2048,
                top_p: config?.topP ?? 0.95
            };

            // Ensure baseUrl ends with /v1 for OpenAI compatibility
            const normalizedBaseUrl = baseUrl.endsWith('/v1') || baseUrl.endsWith('/v1/') 
                ? baseUrl.replace(/\/$/, '') 
                : `${baseUrl.replace(/\/$/, '')}/v1`;
            
            const url = `${normalizedBaseUrl}/chat/completions`;
            
            const response: IHttpResponse = await httpClient.post(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: requestBody
            });

            if (response.statusCode !== 200) {
                throw new Error(`AI API error: ${response.statusCode} - ${response.content}`);
            }

            const aiResponse = response.data as ChatCompletionResponse;
            
            if (!aiResponse.choices || aiResponse.choices.length === 0) {
                throw new Error('No response choices from AI API');
            }

            const choice = aiResponse.choices[0];
            if (!choice.message || !choice.message.content) {
                throw new Error('Invalid response structure from AI API');
            }

            const responseText = choice.message.content;

            return {
                success: true,
                result: responseText,
                tokenUsage: aiResponse.usage ? {
                    promptTokens: aiResponse.usage.prompt_tokens,
                    completionTokens: aiResponse.usage.completion_tokens,
                    totalTokens: aiResponse.usage.total_tokens
                } : undefined
            };

        } catch (error) {
            this.app.getLogger().error(`AI API request failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async analyzeSpamProbability(prData: {
        title: string;
        description: string;
        author: {
            username: string;
            accountAge: string;
            publicRepos: number;
            followers: number;
            isFirstTimeContributor: boolean;
        };
        filesChanged: string[];
        diffSummary: string;
    }): Promise<AIAnalysisResult> {
        const systemInstruction = `You are a code review assistant that analyzes pull requests for spam probability. 
        
Analyze the provided PR data and return a JSON response with:
- spamScore: number (0-100, where 100 is definitely spam)
- reasoning: string explaining your assessment
- keyFlags: array of strings listing concerning factors
- recommendation: "review" or "approve" (if spam score is high, always recommend "review")

Consider factors like:
- Account age and activity
- Quality and relevance of changes
- PR description quality
- File patterns (suspicious mass changes, irrelevant files)
- First-time contributor status`;

        const prompt = `Analyze this pull request for spam probability:

**PR Title:** ${prData.title}

**PR Description:** 
${prData.description || 'No description provided'}

**Author Info:**
- Username: ${prData.author.username}
- Account Age: ${prData.author.accountAge}
- Public Repos: ${prData.author.publicRepos}
- Followers: ${prData.author.followers}
- First Time Contributor: ${prData.author.isFirstTimeContributor}

**Files Changed:** ${prData.filesChanged.length} files
${prData.filesChanged.slice(0, 10).join(', ')}${prData.filesChanged.length > 10 ? '...' : ''}

**Diff Summary:**
${prData.diffSummary}

Provide your analysis as JSON only.`;

        const result = await this.makeAIRequest(prompt, systemInstruction, {
            temperature: 0.2,
            maxTokens: 1024
        });

        if (result.success) {
            try {
                // Try to parse JSON response
                const analysisText = result.result as string;
                const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                
                if (jsonMatch) {
                    const analysis = JSON.parse(jsonMatch[0]);
                    return {
                        ...result,
                        result: analysis
                    };
                } else {
                    throw new Error('No JSON found in response');
                }
            } catch (parseError) {
                this.app.getLogger().warn(`Failed to parse AI JSON response: ${parseError.message}`);
                return {
                    success: false,
                    error: `Failed to parse analysis: ${parseError.message}`
                };
            }
        }

        return result;
    }

    async findBestReviewers(prData: {
        title: string;
        description: string;
        filesChanged: string[];
        diffSummary: string;
        codeowners: { [filePath: string]: string[] };
        commitHistory: { [filePath: string]: Array<{ author: string; commits: number; lastCommit: string }> };
        potentialReviewers: string[];
    }): Promise<AIAnalysisResult> {
        const systemInstruction = `You are a code review assistant that finds the best reviewers for pull requests.

Analyze the provided data and return a JSON response with top 3 reviewers:
- reviewers: array of objects with:
  - username: string
  - reasoning: string (why they're a good fit)
  - expertise: array of strings (areas of expertise)
  - familiarityLevel: "high" | "medium" | "low"
  - score: number (1-100)

Consider:
- CODEOWNERS designations (highest priority)
- Recent commit activity on changed files
- Frequency of contributions to those files
- Expertise areas based on file types and patterns`;

        const codeownersInfo = Object.entries(prData.codeowners)
            .map(([path, owners]) => `${path}: ${owners.join(', ')}`)
            .join('\n');

        const commitHistoryInfo = Object.entries(prData.commitHistory)
            .map(([path, history]) => 
                `${path}:\n${history.map(h => `  - ${h.author}: ${h.commits} commits, last: ${h.lastCommit}`).join('\n')}`
            ).join('\n\n');

        const prompt = `Find the best reviewers for this pull request:

**PR Title:** ${prData.title}

**PR Description:** 
${prData.description || 'No description provided'}

**Files Changed:** 
${prData.filesChanged.join('\n')}

**Diff Summary:**
${prData.diffSummary}

**CODEOWNERS:**
${codeownersInfo}

**Recent Commit History:**
${commitHistoryInfo}

**Available Reviewers:**
${prData.potentialReviewers.join(', ')}

Provide your analysis as JSON only with the top 3 reviewers ranked by suitability.`;

        const result = await this.makeAIRequest(prompt, systemInstruction, {
            temperature: 0.4,
            maxTokens: 1536
        });

        if (result.success) {
            try {
                const analysisText = result.result as string;
                const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                
                if (jsonMatch) {
                    const analysis = JSON.parse(jsonMatch[0]);
                    return {
                        ...result,
                        result: analysis
                    };
                } else {
                    throw new Error('No JSON found in response');
                }
            } catch (parseError) {
                this.app.getLogger().warn(`Failed to parse AI JSON response: ${parseError.message}`);
                return {
                    success: false,
                    error: `Failed to parse analysis: ${parseError.message}`
                };
            }
        }

        return result;
    }
} 