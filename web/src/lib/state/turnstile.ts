import { get, readonly, writable } from "svelte/store";

type VerificationResult = { token: string } | { error: string };

export type TurnstilePrompt = {
    sitekey: string,
    finish: (result: VerificationResult) => void,
};

const prompt = writable<TurnstilePrompt | null>(null);
export const turnstilePrompt = readonly(prompt);

export function verifyWithTurnstile(sitekey: string) {
    get(prompt)?.finish({ error: "error.captcha_cancelled" });

    return new Promise<VerificationResult>(resolve => {
        const finish = (result: VerificationResult) => {
            clearTimeout(timeout);
            if (get(prompt)?.finish === finish) prompt.set(null);
            resolve(result);
        };

        const timeout = setTimeout(() => finish({ error: "error.captcha_too_long" }), 60_000);
        prompt.set({ sitekey, finish });
    });
}
