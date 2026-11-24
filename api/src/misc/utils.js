export function merge(a, b) {
    for (const k of Object.keys(b)) {
        if (Array.isArray(b[k])) {
            a[k] = [...(a[k] ?? []), ...b[k]];
        } else if (typeof b[k] === 'object') {
            a[k] = merge(a[k], b[k]);
        } else {
            a[k] = b[k];
        }
    }

    return a;
}

export function splitFilenameExtension(filename) {
    const parts = filename.split('.');
    const ext = parts.pop();

    if (!parts.length) {
        return [ ext, "" ]
    } else {
        return [ parts.join('.'), ext ]
    }
}

export function zip(a, b) {
    return a.map((value, i) => [ value, b[i] ]);
}

export function isURL(input) {
    try {
        new URL(input);
        return true;
    } catch {
        return false;
    }
}
