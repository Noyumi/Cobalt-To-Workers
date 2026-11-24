import * as _env from "$env/static/public";

const getEnv = (_key: string) => {
    const env = _env as Record<string, string | undefined>;
    const key = `WEB_${_key}`;

    if (key in env) {
        return env[key];
    }
}

const getEnvBool = (key: string) => {
    const value = getEnv(key);
    return value && ['1', 'true'].includes(value.toLowerCase());
}

const variables = {
    HOST: getEnv('HOST'),
    SOURCE_URL: getEnv('SOURCE_URL'),
    PLAUSIBLE_HOST: getEnv('PLAUSIBLE_HOST'),
    PLAUSIBLE_ENABLED: getEnv('HOST') && getEnv('PLAUSIBLE_HOST'),
    DEFAULT_API: getEnv('DEFAULT_API'),
    ENABLE_WEBCODECS: getEnvBool('ENABLE_WEBCODECS'),
    ENABLE_DEPRECATED_YOUTUBE_HLS: getEnvBool('ENABLE_DEPRECATED_YOUTUBE_HLS'),
}

const contacts = {
    discord: "https://discord.gg/pQPt8HBUPu",
    twitter: "https://x.com/justusecobalt",
    github: "https://github.com/imputnet/cobalt",
    bluesky: "https://bsky.app/profile/cobalt.tools",
    telegram_ru: "https://t.me/justusecobalt_ru",
}

const siriShortcuts = {
    photos: "https://www.icloud.com/shortcuts/14e9aebf04b24156acc34ceccf7e6fcd",
    files: "https://www.icloud.com/shortcuts/2134cd9d4d6b41448b2201f933542b2e",
};

const projectName = "Cobalt-To-Workers";

export { contacts, siriShortcuts, projectName };
export default variables;
