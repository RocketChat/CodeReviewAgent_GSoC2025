import { ISetting } from "@rocket.chat/apps-engine/definition/settings";
import { IConfigurationModify } from "@rocket.chat/apps-engine/definition/accessors";
import type {
  IRead,
  IHttp,
  ILogger,
} from "@rocket.chat/apps-engine/definition/accessors";
import { AppSettingsEnum } from "../config/settings";

export async function handleOnSettingUpdated(
  setting: ISetting,
  configurationModify: IConfigurationModify,
  read: IRead,
  http: IHttp,
  logger: ILogger,
  clearAIServices: () => void,
  clearGitHubServices: () => void
): Promise<void> {
  switch (setting.id) {
    case AppSettingsEnum.REPOSITORIES_LIST_ID:
      logger.info(
        "Repository list updated, triggering immediate codeowners sync"
      );
      try {
        // @TODO: Seek Help on how to get Persistence in onSettingUpdated
        // const codeownersService = getCodeownersService();
        // const results = await codeownersService.syncAllRepositories(persistence);
        // for (const [repoName, codeownersData] of Object.entries(results)) {
        //     if (codeownersData) {
        //         await CodeownersPersistence.saveCodeowners(repoName, {
        //             repoName: codeownersData.repoName,
        //             entries: codeownersData.entries.map(entry => ({
        //                 pattern: entry.pattern,
        //                 owners: entry.owners
        //             })),
        //             lastUpdated: codeownersData.lastUpdated
        //         }, persistenceWrite);
        //         logger.info(`Updated CODEOWNERS for ${repoName}`);
        //     }
        // }
      } catch (error: any) {
        logger.error(
          `Failed to sync codeowners after settings update: ${error.message}`
        );
      }
      break;
    case AppSettingsEnum.AI_PROVIDER_API_KEY_ID:
    case AppSettingsEnum.AI_PROVIDER_BASE_URL_ID:
    case AppSettingsEnum.AI_MODEL_ID:
      clearAIServices();
      logger.info(
        `AI setting '${setting.id}' updated, cleared dependent services`
      );
      break;
    case AppSettingsEnum.ORG_ADMIN_PAT_TOKEN_ID:
    case AppSettingsEnum.OWNER_NAME_ID:
      clearGitHubServices();
      logger.info(
        `GitHub setting '${setting.id}' updated, cleared dependent services`
      );
      break;
  }
}
