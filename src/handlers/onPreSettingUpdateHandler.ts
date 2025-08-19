import { ISettingUpdateContext } from "@rocket.chat/apps-engine/definition/settings/ISettingUpdateContext";
import type {
  IRead,
  IHttp,
} from "@rocket.chat/apps-engine/definition/accessors";
import { ISetting } from "@rocket.chat/apps-engine/definition/settings";
import { IConfigurationModify } from "@rocket.chat/apps-engine/definition/accessors";
import { AppSettingsEnum } from "../config/settings";
import { ValidationHelper } from "../helpers/validation";

export async function handleOnPreSettingUpdate(
  context: ISettingUpdateContext,
  configurationModify: IConfigurationModify,
  read: IRead,
  http: IHttp
): Promise<ISetting> {
  const { id, value } = context.newSetting;

  switch (id) {
    case AppSettingsEnum.REPOSITORIES_LIST_ID: {
      const repositories = ValidationHelper.sanitizeRepositoryList(value);
      if (repositories.length === 0) {
        // Logger is not available here, so just keep old value
        return context.oldSetting;
      }
      break;
    }
    case AppSettingsEnum.ORG_ADMIN_PAT_TOKEN_ID: {
      if (!ValidationHelper.isValidGitHubToken(value)) {
        return context.oldSetting;
      }
      break;
    }
    case AppSettingsEnum.AI_PROVIDER_API_KEY_ID: {
      if (!ValidationHelper.isValidApiKey(value)) {
        return context.oldSetting;
      }
      break;
    }
    default:
      break;
  }
  return context.newSetting;
}
