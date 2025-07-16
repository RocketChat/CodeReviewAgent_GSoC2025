import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum AppSettingsEnum {
    OWNER_NAME_ID = 'owner_name',
    REPOSITORIES_LIST_ID = 'repositories_list',
    ORG_ADMIN_PAT_TOKEN_ID = 'org_admin_pat_token',
    AI_PROVIDER_API_KEY_ID = 'ai_provider_api_key',
    AI_MODEL_ID = 'ai_model',
    AI_PROVIDER_BASE_URL_ID = 'ai_provider_base_url',
}

export const settings: Array<ISetting> = [
    {
        id: AppSettingsEnum.OWNER_NAME_ID,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'GitHub Organization/Owner Name',
        i18nDescription: 'The GitHub organization or user that owns the repositories'
    },
    {
        id: AppSettingsEnum.REPOSITORIES_LIST_ID,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        multiline: true,
        i18nLabel: 'Repositories List',
        i18nDescription: 'List of repository names (one per line) to monitor for PRs'
    },
    {
        id: AppSettingsEnum.ORG_ADMIN_PAT_TOKEN_ID,
        type: SettingType.PASSWORD,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'GitHub Personal Access Token',
        i18nDescription: 'Personal Access Token with repo access for the organization'
    },
    {
        id: AppSettingsEnum.AI_PROVIDER_API_KEY_ID,
        type: SettingType.PASSWORD,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'AI Provider API Key',
        i18nDescription: 'API key for your AI provider (OpenAI, Gemini, Claude, etc.)'
    },
    {
        id: AppSettingsEnum.AI_MODEL_ID,
        type: SettingType.SELECT,
        packageValue: 'gpt-3.5-turbo',
        required: true,
        public: false,
        i18nLabel: 'AI Model',
        i18nDescription: 'AI model to use for analysis',
        values: [
            { key: 'gpt-4-turbo-preview', i18nLabel: 'GPT-4 Turbo' },
            { key: 'gpt-4', i18nLabel: 'GPT-4' },
            { key: 'gpt-3.5-turbo', i18nLabel: 'GPT-3.5 Turbo' },
            { key: 'claude-3-opus-20240229', i18nLabel: 'Claude 3 Opus' },
            { key: 'claude-3-sonnet-20240229', i18nLabel: 'Claude 3 Sonnet' },
            { key: 'claude-opus-4-20250514', i18nLabel: 'Claude Opus 4' },
            { key: 'gemini-1.5-pro', i18nLabel: 'Gemini 1.5 Pro' },
            { key: 'gemini-1.5-flash', i18nLabel: 'Gemini 1.5 Flash' },
            { key: 'custom', i18nLabel: 'Custom Model (specify in description)' }
        ]
    },
    {
        id: AppSettingsEnum.AI_PROVIDER_BASE_URL_ID,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'AI Provider Base URL',
        i18nDescription: 'Base URL for your AI provider\'s OpenAI-compatible API endpoint. Examples: https://api.openai.com/v1 (OpenAI), https://generativelanguage.googleapis.com/v1beta/openai (Gemini), https://api.anthropic.com/v1 (Claude)'
    }
];