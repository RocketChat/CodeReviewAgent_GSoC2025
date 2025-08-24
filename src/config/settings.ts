import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum AppSettingsEnum {
    ENABLE_DEV_MODE = 'enable_dev_mode',
    OWNER_NAME_ID = 'owner_name',
    REPOSITORIES_LIST_ID = 'repositories_list',
    ORG_ADMIN_PAT_TOKEN_ID = 'org_admin_pat_token',
    AI_PROVIDER_API_KEY_ID = 'ai_provider_api_key',
    AI_MODEL_ID = 'ai_model',
    AI_PROVIDER_BASE_URL_ID = 'ai_provider_base_url',
}

export const settings: Array<ISetting> = [
    {
        id: AppSettingsEnum.ENABLE_DEV_MODE,
        type: SettingType.BOOLEAN,
        packageValue: false,
        required: true,
        public: false,
        i18nLabel: 'Enable development mode',
        i18nDescription: 'Toggle to switch to Development mode, allowing lower priveleged users to execute admin actions.'
    },
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
        type: SettingType.STRING,
        packageValue: 'gemini-1.5-flash',
        required: true,
        public: false,
        i18nLabel: 'AI Model',
        i18nDescription: 'AI model to use for analysis (gemini-1.5-flash, gpt-4o, etc.)'
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