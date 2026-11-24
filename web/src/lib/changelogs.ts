import { compareVersions } from 'compare-versions';

export const workersChangelogId = "workers";

export function getVersionFromPath(path: string) {
    return path.split('/').pop()?.split('.md').shift()!;
}

export function getAllChangelogs(): Record<string, () => Promise<unknown>> {
    const workersPath = `/changelogs/${workersChangelogId}.md`;
    const { [workersPath]: workers, ...changelogImports } = import.meta.glob("/changelogs/*.md");

    const sortedVersions = Object.keys(changelogImports)
                                 .map(path => [path, getVersionFromPath(path)])
                                 .sort(([, a], [, b]) => compareVersions(a, b));

    const sortedChangelogs = sortedVersions.reduce(
        (obj, [path, version]) => ({
            [version]: changelogImports[path],
            ...obj
        }), {} as typeof changelogImports
    );

    return { [workersChangelogId]: workers, ...sortedChangelogs };
}
