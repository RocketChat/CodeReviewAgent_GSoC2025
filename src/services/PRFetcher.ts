import { IHttpResponse } from '@rocket.chat/apps-engine/definition/accessors';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { CodeReviewAgentApp } from '../../CodeReviewAgentApp';
import { AppSettingsEnum } from '../config/settings';

export class PRService {
  constructor(private app: CodeReviewAgentApp) {}

  public async fetcher(): Promise<Boolean> {
    try {
      const logger = this.app.getLogger();
      const owner = await this.app.getAccessors().environmentReader.getSettings().getValueById(AppSettingsEnum.OWNER_NAME_ID);
      const repositories_list_raw =  await this.app.getAccessors().environmentReader.getSettings().getValueById(AppSettingsEnum.REPOSITORIES_LIST_ID);
      const token = await this.app.getAccessors().environmentReader.getSettings().getValueById(AppSettingsEnum.ORG_ADMIN_PAT_TOKEN_ID)
      const repositories = repositories_list_raw.split('\n')
      const httpClient = this.app.getAccessors().http
      const headers = {
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
      let url = '';
      let response: IHttpResponse;

      repositories.forEach(async (repository) => {
        url = `https://api.github.com/repos/${owner}/${repository}/pulls`
        response = await httpClient.get(url, { headers })
        logger.info(response.data)
      if (response.statusCode !== 200) {
        logger.error(`Failed to fetch pull requests for ${repository}!\n Error: ${response.content}`);
      }
    })
      // save to database? take a decision here!
      return true;
    } catch (error) {
      this.app.getLogger().error(`Error in PRService.fetcher: ${error.message}`);
      throw new Error('Could not retrieve prs. Please try again later.');
    }
  }

}