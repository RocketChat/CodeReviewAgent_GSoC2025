import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum AppSettingsEnum {
    OWNER_NAME_ID = 'owner_name_id',
    OWNER_NAME_LABEL = 'Owner Name',
    OWNER_NAME_DEFAULT = 'RocketChat',
    REPOSITORIES_LIST_ID = 'repositories_list_id',
    REPOSITORIES_LIST_LABEL = 'Repositories List',
    REPOSITORIES_LIST_DEFAULT = 'CodeReviewAgent_GSoC2025'
}

export const settings: ISetting[] = [
    {
        id: AppSettingsEnum.OWNER_NAME_ID,
        i18nLabel: AppSettingsEnum.OWNER_NAME_LABEL,
        type: SettingType.STRING,
        required: true,
        public: false,
        packageValue: AppSettingsEnum.OWNER_NAME_DEFAULT,
    },
    {
        id: AppSettingsEnum.REPOSITORIES_LIST_ID,
        i18nLabel: AppSettingsEnum.REPOSITORIES_LIST_LABEL,
        type: SettingType.STRING,
        required: true,
        public: false,
        packageValue: AppSettingsEnum.REPOSITORIES_LIST_DEFAULT,
        multiline: true
    }
];