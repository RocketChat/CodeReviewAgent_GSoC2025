import { IHttp, IHttpResponse } from '@rocket.chat/apps-engine/definition/accessors';
import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AppSettingsEnum } from '../config/settings';

export interface GeminiRequest {
    contents: Array<{
        parts: Array<{
            text: string;
        }>;
    }>;
    generationConfig?: {
        temperature?: number;
        topK?: number;
        topP?: number;
        maxOutputTokens?: number;
        stopSequences?: string[];
    };
}

export interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
        };
        finishReason: string;
        index: number;
    }>;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

export interface GeminiAnalysisResult {
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

export class GeminiService {
    constructor(private app: CodeReviewAgentApp) {}

    private async getApiConfig(): Promise<{ apiKey: string; baseUrl: string; model: string }> {
        const settings = this.app.getAccessors().environmentReader.getSettings();
        
        const apiKey = await settings.getValueById(AppSettingsEnum.GEMINI_API_KEY_ID);
        const baseUrl = await settings.getValueById(AppSettingsEnum.GEMINI_BASE_URL_ID);
        const model = await settings.getValueById(AppSettingsEnum.GEMINI_MODEL_ID);
        
        if (!apiKey) {
            throw new Error('Gemini API key not configured');
        }
        
        return { apiKey, baseUrl, model };
    }

    public async makeGeminiRequest(
        prompt: string, 
        systemInstruction?: string,
        config?: Partial<GeminiRequest['generationConfig']>
    ): Promise<GeminiAnalysisResult> {
        try {
            const { apiKey, baseUrl, model } = await this.getApiConfig();
            const httpClient = this.app.getAccessors().http;
            
            // Prepare the content with system instruction if provided
            const contents: Array<{ parts: Array<{ text: string }> }> = [];
            
            if (systemInstruction) {
                contents.push({
                    parts: [{ text: systemInstruction }]
                });
            }
            
            contents.push({
                parts: [{ text: prompt }]
            });

            const requestBody: GeminiRequest = {
                contents,
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 2048,
                    ...config
                }
            };

            const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
            
            const response: IHttpResponse = await httpClient.post(url, {
                headers: {
                    'Content-Type': 'application/json'
                },
                data: requestBody
            });

            if (response.statusCode !== 200) {
                throw new Error(`Gemini API error: ${response.statusCode} - ${response.content}`);
            }

            const geminiResponse = response.data as GeminiResponse;
            
            if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
                throw new Error('No response candidates from Gemini API');
            }

            const candidate = geminiResponse.candidates[0];
            if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
                throw new Error('Invalid response structure from Gemini API');
            }

            const responseText = candidate.content.parts[0].text;

            return {
                success: true,
                result: responseText,
                tokenUsage: geminiResponse.usageMetadata ? {
                    promptTokens: geminiResponse.usageMetadata.promptTokenCount,
                    completionTokens: geminiResponse.usageMetadata.candidatesTokenCount,
                    totalTokens: geminiResponse.usageMetadata.totalTokenCount
                } : undefined
            };

        } catch (error) {
            this.app.getLogger().error(`Gemini API request failed: ${error.message}`);
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
    }): Promise<GeminiAnalysisResult> {
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

        const result = await this.makeGeminiRequest(prompt, systemInstruction, {
            temperature: 0.3, // Lower temperature for more consistent analysis
            maxOutputTokens: 1024
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
                this.app.getLogger().warn(`Failed to parse Gemini JSON response: ${parseError.message}`);
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
    }): Promise<GeminiAnalysisResult> {
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

        const result = await this.makeGeminiRequest(prompt, systemInstruction, {
            temperature: 0.4,
            maxOutputTokens: 1536
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
                this.app.getLogger().warn(`Failed to parse Gemini JSON response: ${parseError.message}`);
                return {
                    success: false,
                    error: `Failed to parse analysis: ${parseError.message}`
                };
            }
        }

        return result;
    }
}