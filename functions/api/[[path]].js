import { GitHubStore } from '../../core/store-github.mjs';
import { createApi } from '../../core/api.mjs';
import accounts from '../../config/accounts.json';
import taxCfg from '../../config/tax-2026.json';

// アクセス制御は Cloudflare Access（Google ログイン限定）が前段で行う。
// ここでは認証を持たず、Access を通った要求だけが届く前提で書く。
export const onRequest = ({ request, env }) => {
  const store = new GitHubStore({
    token: env.GITHUB_TOKEN,
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH ?? 'main',
    root: env.LEDGER_ROOT ?? 'ledger',
  });
  return createApi({ store, accounts, taxCfg })(request);
};
