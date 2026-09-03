export function getAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.APP_URL ||
    env.APP_ORIGIN ||
    env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export function buildAppUrl(path: string, env: NodeJS.ProcessEnv = process.env): string {
  const baseUrl = getAppUrl(env);
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
