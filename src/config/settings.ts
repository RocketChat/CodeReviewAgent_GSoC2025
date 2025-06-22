import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum AppSettingsEnum {
    OWNER_NAME_ID = 'owner_name',
    REPOSITORIES_LIST_ID = 'repositories_list',
    ORG_ADMIN_PAT_TOKEN_ID = 'org_admin_pat_token',
    GEMINI_API_KEY_ID = 'gemini_api_key',
    GEMINI_MODEL_ID = 'gemini_model',
    GEMINI_BASE_URL_ID = 'gemini_base_url',
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
        id: AppSettingsEnum.GEMINI_API_KEY_ID,
        type: SettingType.PASSWORD,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Gemini API Key',
        i18nDescription: 'Google Gemini API key for AI-powered analysis'
    },
    {
        id: AppSettingsEnum.GEMINI_MODEL_ID,
        type: SettingType.SELECT,
        packageValue: 'gemini-1.5-flash',
        required: true,
        public: false,
        i18nLabel: 'Gemini Model',
        i18nDescription: 'Gemini model to use for analysis',
        values: [
            { key: 'gemini-1.5-pro', i18nLabel: 'Gemini 1.5 Pro' },
            { key: 'gemini-1.5-flash', i18nLabel: 'Gemini 1.5 Flash' },
            { key: 'gemini-pro', i18nLabel: 'Gemini Pro' }
        ]
    },
    {
        id: AppSettingsEnum.GEMINI_BASE_URL_ID,
        type: SettingType.STRING,
        packageValue: 'https://generativelanguage.googleapis.com/v1beta',
        required: true,
        public: false,
        i18nLabel: 'Gemini API Base URL',
        i18nDescription: 'Base URL for Gemini API (usually https://generativelanguage.googleapis.com/v1beta)'
    }
];